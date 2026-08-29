import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getFinancialReport } from '@/actions/finances'
import { currentFiscalYear, lastFiscalYear } from '@/lib/fiscal-year'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PrintControls } from '@/components/print/print-controls'
import Link from 'next/link'

function money(cents: number): string {
  const neg = cents < 0
  return `${neg ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function categoryLabel(c: string): string {
  return c.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase())
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default async function FinancialReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  if (!(await canAccess(org.id, 'financial_tools'))) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Financial report</h1>
        <UpgradePrompt feature="Financial tools" requiredTier="pro" />
      </div>
    )
  }

  const params = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const db = createServiceRoleClient()
  const { data: brandingRow } = await db
    .from('org_branding')
    .select('fiscal_year_start_month')
    .eq('organization_id', org.id)
    .maybeSingle()
  const fyStartMonth = brandingRow?.fiscal_year_start_month ?? 1
  const thisFY = currentFiscalYear(fyStartMonth, today)
  const lastFY = lastFiscalYear(fyStartMonth, today)
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const from = isDate(params.from) ? params.from! : thisFY.from
  const to = isDate(params.to) ? params.to! : thisFY.to

  const [{ data: orgRow }, report] = await Promise.all([
    db.from('organizations').select('name').eq('id', org.id).single(),
    getFinancialReport(org.id, from, to),
  ])

  // Calendar-year orgs see plain "year" labels; everyone else "fiscal year".
  const yearWord = fyStartMonth === 1 ? 'year' : 'fiscal year'
  const generatedOn = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8 print:max-w-none print:px-0 print:py-0">

      {/* ── Controls (screen only) ─────────────────────────────────────────── */}
      <div className="print:hidden space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Pick a period, then print or save as PDF for your records.
            </p>
          </div>
          <Link href="/admin/finances" className="text-sm text-gray-500 hover:text-gray-700">← Finances</Link>
        </div>

        <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">From</span>
            <input type="date" name="from" defaultValue={from} className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">To</span>
            <input type="date" name="to" defaultValue={to} className="border rounded px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="px-4 py-2 rounded-md text-sm font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
            Update
          </button>
          <span className="flex gap-2 text-xs">
            <Link href={`?from=${thisFY.from}&to=${thisFY.to}`} className="px-2.5 py-1.5 rounded border text-gray-600 hover:bg-gray-50">This {yearWord}</Link>
            <Link href={`?from=${lastFY.from}&to=${lastFY.to}`} className="px-2.5 py-1.5 rounded border text-gray-600 hover:bg-gray-50">Last {yearWord}</Link>
          </span>
        </form>

        <PrintControls />

        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Download ledgers (CSV)</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {([
              ['payments', 'Payments'],
              ['expenses', 'Event expenses'],
              ['overhead', 'Overhead'],
              ['other_income', 'Other income'],
              ['merch', 'Merch orders'],
            ] as const).map(([t, label]) => (
              <a
                key={t}
                href={`/api/export/finances?type=${t}&from=${from}&to=${to}`}
                className="px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50"
                download
              >
                ⬇ {label}
              </a>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Raw rows for the selected period — the payments file includes a
            &ldquo;counted in report&rdquo; column so its totals reconcile to the statement.
          </p>
        </div>
      </div>

      {/* ── The report ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-xl font-bold text-gray-900">{orgRow?.name ?? org.slug} — Financial statement</h2>
          <p className="text-sm text-gray-500">
            {fmtDate(report.fromDate)} to {fmtDate(report.toDate)} · generated {generatedOn}
          </p>
        </div>

        {/* Revenue */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Revenue</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-1.5 text-gray-700">Registration payments</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{money(report.registrationRevenueCents)}</td>
              </tr>
              {report.taxCollectedCents > 0 && (
                <tr>
                  <td className="py-1.5 pl-4 text-xs text-gray-500">of which sales tax collected (to remit)</td>
                  <td className="py-1.5 text-right text-xs text-gray-500 tabular-nums">{money(report.taxCollectedCents)}</td>
                </tr>
              )}
              {report.merchRevenueCents > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-700">Merchandise sales</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(report.merchRevenueCents)}</td>
                </tr>
              )}
              {report.otherIncomeByCategory.map((c) => (
                <tr key={c.category}>
                  <td className="py-1.5 text-gray-700">Other income — {categoryLabel(c.category)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(c.amountCents)}</td>
                </tr>
              ))}
              {report.refundedCents > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-700">Less: refunds issued</td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-red-600">− {money(report.refundedCents)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="py-2 text-gray-900">Total revenue</td>
                <td className="py-2 text-right tabular-nums">{money(report.revenueCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Costs */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Costs</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {report.expensesByCategory.map((c) => (
                <tr key={`e-${c.category}`}>
                  <td className="py-1.5 text-gray-700">Event expenses — {categoryLabel(c.category)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(c.amountCents)}</td>
                </tr>
              ))}
              {report.overheadByCategory.map((c) => (
                <tr key={`o-${c.category}`}>
                  <td className="py-1.5 text-gray-700">Overhead — {categoryLabel(c.category)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(c.amountCents)}</td>
                </tr>
              ))}
              {report.merchCogsCents > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-700">Merchandise cost of goods</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(report.merchCogsCents)}</td>
                </tr>
              )}
              {report.costCents === 0 && (
                <tr><td className="py-1.5 text-gray-400" colSpan={2}>No costs recorded in this period.</td></tr>
              )}
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="py-2 text-gray-900">Total costs</td>
                <td className="py-2 text-right tabular-nums">{money(report.costCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Net */}
        <section className="rounded-xl border bg-gray-50 px-4 py-3 print:border-gray-300 flex items-center justify-between">
          <p className="font-semibold text-gray-900">Net {report.profitCents < 0 ? 'loss' : 'profit'}</p>
          <p className={`text-lg font-bold tabular-nums ${report.profitCents < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {money(report.profitCents)}
          </p>
        </section>

        {/* Per-event breakdown */}
        {report.events.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">By event</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b">
                  <th className="py-1.5 font-medium">Event</th>
                  <th className="py-1.5 font-medium text-right">Revenue</th>
                  <th className="py-1.5 font-medium text-right">Direct costs</th>
                  <th className="py-1.5 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.events.map((e) => (
                  <tr key={e.leagueId ?? 'shop'}>
                    <td className="py-1.5 text-gray-700">{e.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(e.revenueCents)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(e.costCents)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{money(e.revenueCents - e.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">
              Direct costs are event expenses and merchandise cost of goods; org overhead is reported
              above and not split per event here. Sales tax collected is included in revenue figures.
            </p>
          </section>
        )}

        <p className="text-xs text-gray-400 border-t pt-3">
          Payments are dated by when they were paid; refunds by when they were issued; expenses and
          overhead by their incurred date; other income by its received date. Registration revenue counts team fees once per team and
          excludes payments whose registration was removed.
        </p>
      </div>
    </div>
  )
}
