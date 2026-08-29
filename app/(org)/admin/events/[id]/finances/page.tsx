import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getEventPnl, getEventExpenses, getEventBudget, getEventRevenue, getEventRevenueBySession } from '@/actions/finances'
import { EventExpensesManager } from '@/components/finances/event-expenses-manager'
import { EventRevenueManager } from '@/components/finances/event-revenue-manager'
import { BudgetPlanner } from '@/components/finances/budget-planner'

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

  const { data: league } = await db
    .from('leagues').select('id, event_type').eq('id', id).eq('organization_id', org.id).single()
  if (!league) notFound()
  const isSessionBased = league.event_type === 'drop_in' || league.event_type === 'pickup'

  const [pnl, expenses, revenue, budget, { data: rawSessions }, { data: branding }, sessionRevenue] = await Promise.all([
    getEventPnl(id, org.id),
    getEventExpenses(id),
    getEventRevenue(id),
    getEventBudget(id),

    db.from('event_sessions').select('id, scheduled_at')
      .eq('league_id', id).eq('organization_id', org.id).order('scheduled_at', { ascending: true }),

    db.from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle(),

    isSessionBased ? getEventRevenueBySession(id, org.id) : Promise.resolve([]),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'
  const sessions = (rawSessions ?? []).map((s: { id: string; scheduled_at: string }) => ({
    id: s.id,
    label: new Date(s.scheduled_at).toLocaleString('en-CA', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
    }),
  }))

  // Per-session revenue rows in session order; league-level payments
  // (season passes / team fees) last.
  const sessionLabel = new Map(sessions.map((sx) => [sx.id, sx.label]))
  const sessionRevenueRows = sessionRevenue
    .map((r) => ({
      ...r,
      label: r.sessionId ? (sessionLabel.get(r.sessionId) ?? 'Removed session') : 'Season passes & team fees',
      order: r.sessionId ? sessions.findIndex((sx) => sx.id === r.sessionId) : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order)

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── P&L summary ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Profit &amp; loss</h2>
        <div className="bg-white rounded-xl border divide-y">
          <Row label="Registration revenue" value={money(pnl.registrationRevenueCents)} />
          {pnl.merchRevenueCents > 0 && <Row label="Merchandise revenue" value={money(pnl.merchRevenueCents)} />}
          {pnl.otherRevenueCents > 0 && <Row label="Other income" value={money(pnl.otherRevenueCents)} />}
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
          Revenue counts paid &amp; manual registration payments, this event&rsquo;s merch sales, and any other income
          you log below (donations, 50/50, sponsorships…). Set unit costs on merch items to include their cost.
        </p>
      </section>

      {/* ── Registration revenue by session (drop-in / pickup) ───────────── */}
      {isSessionBased && sessionRevenueRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Registration revenue by session</h2>
          <div className="bg-white rounded-xl border divide-y">
            {sessionRevenueRows.map((r) => (
              <div key={r.sessionId ?? 'league'} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{r.label}</p>
                  <p className="text-xs text-gray-400">{r.paymentCount} payment{r.paymentCount !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{money(r.amountCents)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Grouped by the session each registration was for. Season passes and team fees aren&rsquo;t tied
            to a single session, so they&rsquo;re listed on their own line.
          </p>
        </section>
      )}

      {/* ── Other income ledger ──────────────────────────────────────────── */}
      <EventRevenueManager leagueId={id} initialRevenue={revenue} />

      {/* ── Expenses ledger ──────────────────────────────────────────────── */}
      <EventExpensesManager leagueId={id} initialExpenses={expenses} sessions={sessions} />

      {/* ── Pricing planner ──────────────────────────────────────────────── */}
      <BudgetPlanner leagueId={id} initial={budget} />
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
