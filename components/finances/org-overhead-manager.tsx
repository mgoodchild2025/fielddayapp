'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { addOrgOverhead, updateOrgOverhead, deleteOrgOverhead, saveOverheadAllocations } from '@/actions/finances'
import { AttachmentsControl } from '@/components/finances/receipt-control'
import { TaxCalc } from '@/components/finances/tax-calc'
import type { OrgOverhead, AllocationTarget } from '@/actions/finances'
import { OVERHEAD_CATEGORIES, OVERHEAD_PERIODS, type OverheadCategory, type OverheadPeriod } from '@/lib/finance-constants'

const CATEGORY_LABELS: Record<OverheadCategory, string> = {
  insurance: 'Insurance',
  equipment: 'Equipment',
  software: 'Software',
  rent: 'Rent',
  salaries: 'Salaries',
  marketing: 'Marketing',
  other: 'Other',
}

const PERIOD_LABELS: Record<OverheadPeriod, string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  annual: 'Annual',
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

/** Inline editor: split one overhead expense across events. */
function AllocationEditor({ expense, targets, onDone }: {
  expense: OrgOverhead
  targets: AllocationTarget[]
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // leagueId → dollars string; seeded from the saved allocations
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const a of expense.allocations ?? []) init[a.leagueId] = (a.amountCents / 100).toFixed(2)
    return init
  })
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set((expense.allocations ?? []).map((a) => a.leagueId))
  )

  const allocatedCents = [...checked].reduce((sum, id) => {
    const v = Math.round(parseFloat(amounts[id] || '0') * 100)
    return sum + (Number.isFinite(v) && v > 0 ? v : 0)
  }, 0)
  const remainingCents = expense.amount_cents - allocatedCents

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Split the full amount over the checked events, weighted; remainder cents on the first. */
  function split(weightOf: (t: AllocationTarget) => number) {
    const picked = targets.filter((t) => checked.has(t.leagueId))
    const totalWeight = picked.reduce((sum, t) => sum + weightOf(t), 0)
    if (picked.length === 0 || totalWeight === 0) return
    const next: Record<string, string> = {}
    let assigned = 0
    picked.forEach((t, i) => {
      const cents = i === picked.length - 1
        ? expense.amount_cents - assigned
        : Math.round(expense.amount_cents * (weightOf(t) / totalWeight))
      assigned += cents
      next[t.leagueId] = (cents / 100).toFixed(2)
    })
    setAmounts((prev) => ({ ...prev, ...next }))
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await saveOverheadAllocations({
        overheadId: expense.id,
        allocations: [...checked]
          .map((leagueId) => ({ leagueId, amountCents: Math.round(parseFloat(amounts[leagueId] || '0') * 100) }))
          .filter((a) => Number.isFinite(a.amountCents) && a.amountCents > 0),
      })
      if (res.error) { setError(res.error); return }
      onDone()
      router.refresh()
    })
  }

  const anySessions = targets.some((t) => checked.has(t.leagueId) && t.sessionCount > 0)

  return (
    <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">
          Allocate {money(expense.amount_cents)} to events
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => split(() => 1)} disabled={checked.size === 0}
            className="text-xs px-2 py-1 rounded border bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            Split equally
          </button>
          <button type="button" onClick={() => split((t) => t.sessionCount)} disabled={!anySessions}
            className="text-xs px-2 py-1 rounded border bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            title="Weighted by each event's session count">
            Split by sessions
          </button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 rounded border bg-white">
        {targets.map((t) => (
          <label key={t.leagueId} className="flex items-center gap-2 px-3 py-2 text-sm">
            <input type="checkbox" checked={checked.has(t.leagueId)} onChange={() => toggle(t.leagueId)} />
            <span className="flex-1 min-w-0">
              <span className="block truncate text-gray-800">{t.name}</span>
              <span className="text-[11px] text-gray-400 capitalize">
                {t.status.replace(/_/g, ' ')}{t.sessionCount > 0 ? ` · ${t.sessionCount} sessions` : ''}
              </span>
            </span>
            {checked.has(t.leagueId) && (
              <span className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="number" step="0.01" min="0"
                  value={amounts[t.leagueId] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [t.leagueId]: e.target.value }))}
                  className="w-24 border rounded pl-5 pr-2 py-1 text-sm text-right"
                />
              </span>
            )}
          </label>
        ))}
        {targets.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No events to allocate to.</p>}
      </div>
      <div className="flex items-center justify-between">
        <p className={`text-xs ${remainingCents < 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
          {remainingCents < 0
            ? `Over-allocated by ${money(-remainingCents)}`
            : `${money(remainingCents)} stays unallocated org overhead`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={save} disabled={pending || remainingCents < 0}
            className="px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            {pending ? 'Saving…' : 'Save allocation'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function OrgOverheadManager({ initialOverhead, allocationTargets = [], defaultTaxPct = 0 }: {
  initialOverhead: OrgOverhead[]
  allocationTargets?: AllocationTarget[]
  /** Org's combined active sales-tax rate — powers the one-tap "Calc X%" helper. */
  defaultTaxPct?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // null = form closed · 'new' = adding · otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null)
  const [allocatingId, setAllocatingId] = useState<string | null>(null)

  const [category, setCategory] = useState<OverheadCategory>('insurance')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('')
  const [period, setPeriod] = useState<OverheadPeriod>('annual')
  const [appliesTo, setAppliesTo] = useState<'general' | 'shop'>('general')
  const [incurredOn, setIncurredOn] = useState('')

  const total = initialOverhead.reduce((s, e) => s + e.amount_cents, 0)
  const totalTax = initialOverhead.reduce((s, e) => s + (e.tax_cents ?? 0), 0)
  const isNew = editing === 'new'
  const adding = editing !== null

  function reset() {
    setCategory('insurance'); setDescription(''); setAmount(''); setTax(''); setPeriod('annual'); setAppliesTo('general'); setIncurredOn('')
  }

  function startEdit(e: OrgOverhead) {
    setCategory(e.category); setDescription(e.description)
    setAmount((e.amount_cents / 100).toFixed(2))
    setTax(e.tax_cents ? (e.tax_cents / 100).toFixed(2) : '')
    setPeriod(e.period); setAppliesTo(e.applies_to); setIncurredOn(e.incurred_on ?? '')
    setError(null); setAllocatingId(null)
    setEditing(e.id)
  }

  function close() { setEditing(null); reset(); setError(null) }

  function submit() {
    const cents = Math.round(parseFloat(amount) * 100)
    const taxCents = tax.trim() === '' ? 0 : Math.round(parseFloat(tax) * 100)
    if (!description.trim()) { setError('Enter a description.'); return }
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    if (isNaN(taxCents) || taxCents < 0 || taxCents > cents) { setError('Tax must be between 0 and the amount.'); return }
    setError(null)
    startTransition(async () => {
      const common = { category, description, amountCents: cents, taxCents, period, appliesTo, incurredOn: incurredOn || null }
      const res = isNew ? await addOrgOverhead(common) : await updateOrgOverhead({ ...common, id: editing! })
      if (res.error) { setError(res.error); return }
      close(); router.refresh()
    })
  }

  function remove(id: string) {
    if (!confirm('Delete this overhead expense and its attachments?')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteOrgOverhead(id)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  const form = (
        <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as OverheadCategory)} className="border rounded px-2 py-1.5 text-sm bg-white">
              {OVERHEAD_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border rounded pl-5 pr-2 py-1.5 text-sm" />
            </div>
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. Liability insurance)" className="w-full border rounded px-2 py-1.5 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as OverheadPeriod)} className="border rounded px-2 py-1.5 text-sm bg-white">
              {OVERHEAD_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </select>
            <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as 'general' | 'shop')} className="border rounded px-2 py-1.5 text-sm bg-white">
              <option value="general">General</option>
              <option value="shop">Shop</option>
            </select>
            <input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} className="border rounded px-2 py-1.5 text-sm text-gray-600" />
          </div>
          {/* Recoverable tax paid — feeds the report's net remittance (collected − paid) */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input type="number" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="Tax included (HST/GST) — optional" className="w-full border rounded pl-5 pr-2 py-1.5 text-sm" />
            </div>
            <TaxCalc amount={amount} defaultPct={defaultTaxPct} onCalc={setTax} />
          </div>
          <p className="text-[11px] text-gray-400">Enter only the <em>recoverable</em> tax (HST/GST/QST). It&apos;s subtracted from tax collected on the financial report.</p>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={close} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={pending} className="px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {pending ? 'Saving…' : isNew ? 'Save' : 'Save changes'}
            </button>
          </div>
        </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Overhead</h2>
          <p className="text-xs text-gray-400">Org-wide costs not tied to one event (insurance, equipment, software…).</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => { reset(); setEditing('new') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-4 h-4" /> Add overhead
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {isNew && form}

      {initialOverhead.length === 0 && !isNew ? (
        <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
          No overhead yet. Insurance, rent, software — log org-wide costs here and allocate them to events.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-50">
              {initialOverhead.map((e) => {
                const allocated = (e.allocations ?? []).reduce((sum, a) => sum + a.amountCents, 0)
                if (editing === e.id) {
                  return (
                    <tr key={e.id}>
                      <td colSpan={3} className="p-2">{form}</td>
                    </tr>
                  )
                }
                return (
                <Fragment key={e.id}>
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{e.description}</p>
                    <p className="text-xs text-gray-400">
                      {CATEGORY_LABELS[e.category]} · {PERIOD_LABELS[e.period]}
                      {e.applies_to === 'shop' ? ' · Shop' : ''}
                      {e.incurred_on ? ` · ${new Date(e.incurred_on).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      {e.tax_cents ? ` · incl. ${money(e.tax_cents)} tax` : ''}
                    </p>
                    {allocated > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {money(allocated)} allocated to {(e.allocations ?? []).length} event{(e.allocations ?? []).length !== 1 ? 's' : ''}
                        <span className="text-gray-400"> · {(e.allocations ?? []).map((a) => a.leagueName).join(', ')}</span>
                      </p>
                    )}
                    <div className="mt-0.5">
                      <AttachmentsControl kind="overhead" expenseId={e.id} attachments={e.attachments ?? []} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">{money(e.amount_cents)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setAllocatingId(allocatingId === e.id ? null : e.id)}
                      className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 mr-2 py-2 -my-2 px-1">
                      Allocate
                    </button>
                    <button type="button" onClick={() => startEdit(e)} disabled={pending} className="text-gray-400 hover:text-gray-700 disabled:opacity-40 align-middle p-2 -my-2" aria-label="Edit overhead">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(e.id)} disabled={pending} className="text-gray-400 hover:text-red-600 disabled:opacity-40 align-middle p-2 -my-2" aria-label="Delete overhead">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {allocatingId === e.id && (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 bg-gray-50/50">
                      <AllocationEditor expense={e} targets={allocationTargets} onDone={() => setAllocatingId(null)} />
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                <td className="px-4 py-2.5">
                  Total overhead
                  {totalTax > 0 && <span className="ml-2 text-xs font-normal text-gray-400">incl. {money(totalTax)} recoverable tax</span>}
                </td>
                <td className="px-4 py-2.5 text-right">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
