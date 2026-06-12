import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getShopPnl, getOrgPnl, getOrgOverhead } from '@/actions/finances'
import { OrgOverheadManager } from '@/components/finances/org-overhead-manager'
import Link from 'next/link'

function money(cents: number): string {
  const neg = cents < 0
  return `${neg ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function pct(fraction: number | null): string {
  return fraction === null ? '—' : `${Math.round(fraction * 100)}%`
}

export default async function FinancesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  if (!(await canAccess(org.id, 'financial_tools'))) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Finances</h1>
        <UpgradePrompt feature="Financial tools" requiredTier="pro" />
      </div>
    )
  }

  const [shop, pnl, overhead] = await Promise.all([
    getShopPnl(org.id),
    getOrgPnl(org.id),
    getOrgOverhead(org.id),
  ])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finances</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track profit across your events and shop. Set a unit cost on items to see margins.
        </p>
      </div>

      {/* ── Org-wide P&L overview ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Total revenue</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{money(pnl.revenueCents)}</p>
            <p className="text-[11px] text-gray-400 mt-1">registrations + merch</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Total costs</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{money(pnl.costCents)}</p>
            <p className="text-[11px] text-gray-400 mt-1">expenses + COGS + overhead</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Net profit</p>
            <p className={`text-xl font-bold mt-1 ${pnl.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(pnl.profitCents)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{pct(pnl.marginPct)} margin</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Overhead</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{money(pnl.overheadCents)}</p>
            <p className="text-[11px] text-gray-400 mt-1">org-wide</p>
          </div>
        </div>

        {pnl.events.length > 0 && (
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Event</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Revenue</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Costs</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pnl.events.map((e) => (
                    <tr key={e.leagueId ?? 'shop'} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-800 max-w-[260px] truncate">
                        {e.leagueId ? (
                          <Link href={`/admin/events/${e.leagueId}/finances`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                            {e.name}
                          </Link>
                        ) : e.name}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{money(e.revenueCents)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{money(e.costCents)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${e.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(e.profitCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                    <td className="px-4 py-3">Overhead (org-wide)</td>
                    <td className="px-4 py-3 text-right text-gray-300">—</td>
                    <td className="px-4 py-3 text-right">{money(pnl.overheadCents)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{money(-pnl.overheadCents)}</td>
                  </tr>
                  <tr className="bg-gray-50 border-t font-bold text-gray-900">
                    <td className="px-4 py-3">Net</td>
                    <td className="px-4 py-3 text-right">{money(pnl.revenueCents)}</td>
                    <td className="px-4 py-3 text-right">{money(pnl.costCents)}</td>
                    <td className={`px-4 py-3 text-right ${pnl.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(pnl.profitCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Overhead ledger ────────────────────────────────────────────────── */}
      <OrgOverheadManager initialOverhead={overhead} />

      {/* ── Shop profit & loss ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Shop profit</h2>

        {shop.orderCount === 0 ? (
          <div className="bg-white rounded-lg border border-dashed p-8 text-center space-y-1">
            <p className="text-sm font-medium text-gray-600">No shop sales yet</p>
            <p className="text-xs text-gray-400">Profit appears here once items sell from the standalone shop.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">Revenue</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{money(shop.revenueCents)}</p>
                <p className="text-[11px] text-gray-400 mt-1">{shop.orderCount} order{shop.orderCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">Cost of goods</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{money(shop.cogsCents)}</p>
                <p className="text-[11px] text-gray-400 mt-1">tracked items only</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">Profit</p>
                <p className={`text-xl font-bold mt-1 ${shop.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {money(shop.profitCents)}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">revenue − COGS</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">Margin</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{pct(shop.margin)}</p>
                <p className="text-[11px] text-gray-400 mt-1">on tracked sales</p>
              </div>
            </div>

            {shop.untrackedItemCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                {shop.untrackedItemCount} sold item{shop.untrackedItemCount !== 1 ? 's have' : ' has'} no unit cost set, so
                {shop.untrackedItemCount !== 1 ? ' their' : ' its'} profit isn&rsquo;t counted. Add a unit cost on the item
                in <span className="font-medium">Shop → Items</span> to include it.
              </div>
            )}

            {/* Per-item breakdown */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Item</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Units</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Revenue</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">COGS</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Profit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {shop.items.map((it) => (
                      <tr key={it.itemId} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-800 max-w-[220px] truncate">{it.name}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{it.unitsSold}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{money(it.revenueCents)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {it.costCents === null ? <span className="text-gray-300">—</span> : money(it.costCents)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${it.profitCents === null ? 'text-gray-300' : it.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {it.profitCents === null ? 'no cost' : money(it.profitCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{pct(it.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                      <td className="px-4 py-3">Total</td>
                      <td />
                      <td className="px-4 py-3 text-right">{money(shop.revenueCents)}</td>
                      <td className="px-4 py-3 text-right">{money(shop.cogsCents)}</td>
                      <td className={`px-4 py-3 text-right ${shop.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(shop.profitCents)}</td>
                      <td className="px-4 py-3 text-right">{pct(shop.margin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
