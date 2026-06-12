'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { addEventExpense, deleteEventExpense } from '@/actions/finances'
import type { EventExpense } from '@/actions/finances'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/finance-constants'

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rental: 'Venue / rental',
  referee: 'Referees',
  insurance: 'Insurance',
  prizes: 'Prizes',
  equipment: 'Equipment',
  staff: 'Staff',
  marketing: 'Marketing',
  other: 'Other',
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function EventExpensesManager({ leagueId, initialExpenses }: { leagueId: string; initialExpenses: EventExpense[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [category, setCategory] = useState<ExpenseCategory>('rental')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [incurredOn, setIncurredOn] = useState('')

  const total = initialExpenses.reduce((s, e) => s + e.amount_cents, 0)

  function reset() {
    setCategory('rental'); setDescription(''); setAmount(''); setVendor(''); setIncurredOn('')
  }

  function submit() {
    const cents = Math.round(parseFloat(amount) * 100)
    if (!description.trim()) { setError('Enter a description.'); return }
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    setError(null)
    startTransition(async () => {
      const res = await addEventExpense({
        leagueId, category, description, amountCents: cents,
        vendor: vendor || undefined, incurredOn: incurredOn || null,
      })
      if (res.error) { setError(res.error); return }
      reset(); setAdding(false); router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await deleteEventExpense(id, leagueId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-4 h-4" /> Add expense
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {adding && (
        <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="border rounded px-2 py-1.5 text-sm bg-white">
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border rounded pl-5 pr-2 py-1.5 text-sm" />
            </div>
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. Gym rental — 10 weeks)" className="w-full border rounded px-2 py-1.5 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" className="border rounded px-2 py-1.5 text-sm" />
            <input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} className="border rounded px-2 py-1.5 text-sm text-gray-600" />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => { setAdding(false); reset(); setError(null) }} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={pending} className="px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {initialExpenses.length === 0 && !adding ? (
        <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
          No expenses logged yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-50">
              {initialExpenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{e.description}</p>
                    <p className="text-xs text-gray-400">
                      {CATEGORY_LABELS[e.category]}
                      {e.vendor ? ` · ${e.vendor}` : ''}
                      {e.incurred_on ? ` · ${new Date(e.incurred_on).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">{money(e.amount_cents)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => remove(e.id)} disabled={pending} className="text-gray-400 hover:text-red-600 disabled:opacity-40" aria-label="Delete expense">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                <td className="px-4 py-2.5">Total expenses</td>
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
