import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getEventPnl, getEventExpenses } from '@/actions/finances'
import { EventExpensesManager } from '@/components/finances/event-expenses-manager'

function money(cents: number): string {
  const neg = cents < 0
  return `${neg ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`
}

export default async function EventFinancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!(await canAccess(org.id, 'financial_tools'))) {
    return <UpgradePrompt feature="Financial tools" requiredTier="pro" />
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('id').eq('id', id).eq('organization_id', org.id).single()
  if (!league) notFound()

  const [pnl, expenses] = await Promise.all([
    getEventPnl(id, org.id),
    getEventExpenses(id),
  ])

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── P&L summary ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Profit &amp; loss</h2>
        <div className="bg-white rounded-xl border divide-y">
          <Row label="Registration revenue" value={money(pnl.registrationRevenueCents)} />
          {pnl.merchRevenueCents > 0 && <Row label="Merchandise revenue" value={money(pnl.merchRevenueCents)} />}
          <Row label="Total revenue" value={money(pnl.revenueCents)} strong />
          <Row label="Expenses" value={`− ${money(pnl.expenseCents)}`} muted />
          {pnl.merchCogsCents > 0 && <Row label="Merchandise cost" value={`− ${money(pnl.merchCogsCents)}`} muted />}
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-gray-900">Net profit</p>
              {pnl.marginPct !== null && (
                <p className="text-xs text-gray-400">{Math.round(pnl.marginPct * 100)}% margin</p>
              )}
            </div>
            <p className={`text-xl font-bold ${pnl.profitCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {money(pnl.profitCents)}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Revenue counts paid &amp; manual registration payments plus this event&rsquo;s merch sales. Set unit costs on
          merch items to include their cost.
        </p>
      </section>

      {/* ── Expenses ledger ──────────────────────────────────────────────── */}
      <EventExpensesManager leagueId={id} initialExpenses={expenses} />
    </div>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <p className={`text-sm ${strong ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'}`}>{label}</p>
      <p className={`text-sm ${strong ? 'font-bold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
