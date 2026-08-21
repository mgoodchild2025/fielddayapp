'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { saveEventBudget } from '@/actions/finances'
import type { EventBudget, BudgetPricingModel } from '@/actions/finances'
import { type BudgetCostType } from '@/lib/finance-constants'

const COST_TYPE_LABELS: Record<BudgetCostType, string> = {
  fixed: 'Fixed',
  per_team: 'Per team',
  per_player: 'Per player',
}

type LineDraft = { key: number; label: string; costType: BudgetCostType; amount: string }
let nextKey = 1

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

const MODEL_LABELS: Record<BudgetPricingModel, { unit: string; plural: string; countLabel: string }> = {
  per_player: { unit: 'per player', plural: 'players', countLabel: 'player' },
  per_team: { unit: 'per team', plural: 'teams', countLabel: 'team' },
}

export function BudgetPlanner({ leagueId, initial }: { leagueId: string; initial: EventBudget }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [teams, setTeams] = useState(String(initial.budget?.expected_teams ?? ''))
  const [players, setPlayers] = useState(String(initial.budget?.expected_participants ?? ''))
  const [marginPct, setMarginPct] = useState(String(Math.round((initial.budget?.target_margin_pct ?? 0) * 100)))
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (initial.items.length > 0 ? initial.items : []).map((it) => ({
      key: nextKey++, label: it.label, costType: it.cost_type, amount: (it.amount_cents / 100).toFixed(2),
    }))
  )

  // How the event actually bills today — the reality the profit line is measured against.
  const eventPaymentMode = initial.league?.payment_mode ?? 'per_player'
  const currentPriceCents = initial.league?.price_cents ?? 0

  // The model the PLAN is costed against. Defaults to how the event bills, but
  // an admin can price the same costs the other way round before committing to
  // it on the event itself.
  const [pricingModel, setPricingModel] = useState<BudgetPricingModel>(
    initial.budget?.pricing_model ?? eventPaymentMode
  )

  function addLine() {
    setLines((p) => [...p, { key: nextKey++, label: '', costType: 'fixed', amount: '' }])
  }
  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function removeLine(key: number) {
    setLines((p) => p.filter((l) => l.key !== key))
  }

  // ── Live calculator ────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const nTeams = Math.max(0, parseInt(teams) || 0)
    const nPlayers = Math.max(0, parseInt(players) || 0)
    const margin = Math.min(0.99, Math.max(0, (parseFloat(marginPct) || 0) / 100))

    let totalCost = 0
    for (const l of lines) {
      const amt = Math.round((parseFloat(l.amount) || 0) * 100)
      if (l.costType === 'fixed') totalCost += amt
      else if (l.costType === 'per_team') totalCost += amt * nTeams
      else totalCost += amt * nPlayers
    }

    const targetRevenue = margin < 1 ? totalCost / (1 - margin) : totalCost
    const perPlayerBreakeven = nPlayers > 0 ? totalCost / nPlayers : null
    const perTeamBreakeven = nTeams > 0 ? totalCost / nTeams : null
    const perPlayerTarget = nPlayers > 0 ? targetRevenue / nPlayers : null
    const perTeamTarget = nTeams > 0 ? targetRevenue / nTeams : null

    // Projected profit at the league's current price — always measured against
    // how the event bills TODAY, whatever model the plan is exploring.
    const projectedRevenue = eventPaymentMode === 'per_team' ? currentPriceCents * nTeams : currentPriceCents * nPlayers
    const projectedProfit = projectedRevenue - totalCost

    return {
      nTeams, nPlayers, margin, totalCost, targetRevenue,
      perPlayerBreakeven, perTeamBreakeven, perPlayerTarget, perTeamTarget,
      projectedRevenue, projectedProfit,
    }
  }, [teams, players, marginPct, lines, eventPaymentMode, currentPriceCents])

  const isPerTeam = pricingModel === 'per_team'
  const recommendedCents = isPerTeam ? calc.perTeamTarget : calc.perPlayerTarget
  const breakevenCents = isPerTeam ? calc.perTeamBreakeven : calc.perPlayerBreakeven
  // The same plan expressed the other way round, so the two models can be compared.
  const otherModel: BudgetPricingModel = isPerTeam ? 'per_player' : 'per_team'
  const otherRecommendedCents = isPerTeam ? calc.perPlayerTarget : calc.perTeamTarget

  function save() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await saveEventBudget({
        leagueId,
        expectedTeams: parseInt(teams) || 0,
        expectedParticipants: parseInt(players) || 0,
        targetMarginPct: Math.min(0.99, Math.max(0, (parseFloat(marginPct) || 0) / 100)),
        pricingModel,
        items: lines.filter((l) => l.label.trim()).map((l) => ({
          label: l.label, costType: l.costType, amountCents: Math.round((parseFloat(l.amount) || 0) * 100),
        })),
      })
      if (res.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pricing planner</h2>
        <p className="text-xs text-gray-400">
          Model projected costs and get a recommended price, per player or per team. Advise only — it doesn&rsquo;t
          change the event&rsquo;s price.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── Inputs ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-gray-500">Expected teams
              <input type="number" min="0" value={teams} onChange={(e) => setTeams(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">Expected players
              <input type="number" min="0" value={players} onChange={(e) => setPlayers(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">Target margin
              <div className="relative mt-1">
                <input type="number" min="0" max="99" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className="w-full border rounded pl-2 pr-6 py-1.5 text-sm" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
            </label>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-gray-600">Projected costs</p>
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <input value={l.label} onChange={(e) => updateLine(l.key, { label: e.target.value })} placeholder="e.g. Gym rental" className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm" />
                <select value={l.costType} onChange={(e) => updateLine(l.key, { costType: e.target.value as BudgetCostType })} className="border rounded px-1.5 py-1.5 text-sm bg-white shrink-0">
                  {(['fixed', 'per_team', 'per_player'] as BudgetCostType[]).map((t) => <option key={t} value={t}>{COST_TYPE_LABELS[t]}</option>)}
                </select>
                <div className="relative w-24 shrink-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <input type="number" step="0.01" min="0" value={l.amount} onChange={(e) => updateLine(l.key, { amount: e.target.value })} placeholder="0.00" className="w-full border rounded pl-5 pr-1.5 py-1.5 text-sm" />
                </div>
                <button type="button" onClick={() => removeLine(l.key)} className="text-gray-300 hover:text-red-500 shrink-0" aria-label="Remove cost">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-primary)]">
              <Plus className="w-4 h-4" /> Add cost
            </button>
          </div>
        </div>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          {/* Which billing model the plan is priced for */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Price</span>
            <div className="inline-flex rounded-lg border overflow-hidden">
              {(['per_player', 'per_team'] as BudgetPricingModel[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPricingModel(m)}
                  aria-pressed={pricingModel === m}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    pricingModel === m ? 'text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                  style={pricingModel === m ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                >
                  {MODEL_LABELS[m].unit}
                </button>
              ))}
            </div>
            {pricingModel !== eventPaymentMode && (
              <span className="text-[11px] text-amber-700">
                Event bills {MODEL_LABELS[eventPaymentMode].unit} today
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total projected cost</span>
            <span className="text-sm font-semibold text-gray-900">{money(calc.totalCost)}</span>
          </div>

          <div className="rounded-lg bg-gray-50 border p-3 text-center">
            <p className="text-xs text-gray-500">
              Recommended price ({MODEL_LABELS[pricingModel].unit}, {Math.round(calc.margin * 100)}% margin)
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              {recommendedCents !== null ? money(Math.ceil(recommendedCents)) : <span className="text-gray-300 text-base">enter expected {MODEL_LABELS[pricingModel].plural}</span>}
            </p>
            {breakevenCents !== null && (
              <p className="text-[11px] text-gray-400 mt-1">Break-even: {money(Math.ceil(breakevenCents))}</p>
            )}
            {otherRecommendedCents !== null && (
              <p className="text-[11px] text-gray-400 mt-1">
                Same plan {MODEL_LABELS[otherModel].unit}: {money(Math.ceil(otherRecommendedCents))}
              </p>
            )}
          </div>

          <div className="space-y-1.5 text-sm pt-1">
            <div className="flex items-center justify-between text-gray-500">
              <span>Current price</span>
              <span>{money(currentPriceCents)} / {MODEL_LABELS[eventPaymentMode].countLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Projected profit at current price</span>
              <span className={`font-semibold ${calc.projectedProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(calc.projectedProfit)}</span>
            </div>
            <p className="text-[11px] text-gray-400">
              Based on {calc.nTeams} team{calc.nTeams !== 1 ? 's' : ''} / {calc.nPlayers} player{calc.nPlayers !== 1 ? 's' : ''}
              , billed {MODEL_LABELS[eventPaymentMode].unit}.
            </p>
            {pricingModel !== eventPaymentMode && (
              <p className="text-[11px] text-gray-400">
                To charge {MODEL_LABELS[pricingModel].unit}, switch the event&rsquo;s price model in its settings — the
                planner never changes it for you.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {pending ? 'Saving…' : 'Save plan'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </section>
  )
}
