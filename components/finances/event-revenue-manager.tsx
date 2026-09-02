'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { addEventRevenue, updateEventRevenue, deleteEventRevenue } from '@/actions/finances'
import type { EventRevenue } from '@/actions/finances'
import { REVENUE_CATEGORIES, type RevenueCategory } from '@/lib/finance-constants'

const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  donation: 'Donation',
  fifty_fifty: '50/50 draw',
  sponsorship: 'Sponsorship',
  concessions: 'Concessions',
  fundraiser: 'Fundraiser',
  other: 'Other',
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function EventRevenueManager({ leagueId, initialRevenue }: { leagueId: string; initialRevenue: EventRevenue[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // null = form closed · 'new' = adding · otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null)

  const [category, setCategory] = useState<RevenueCategory>('donation')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [receivedOn, setReceivedOn] = useState('')

  const total = initialRevenue.reduce((s, e) => s + e.amount_cents, 0)
  const isNew = editing === 'new'

  function reset() {
    setCategory('donation'); setDescription(''); setAmount(''); setSource(''); setReceivedOn('')
  }

  function startEdit(e: EventRevenue) {
    setCategory(e.category)
    setDescription(e.description)
    setAmount((e.amount_cents / 100).toFixed(2))
    setSource(e.source ?? '')
    setReceivedOn(e.received_on ?? '')
    setError(null)
    setEditing(e.id)
  }

  function close() {
    setEditing(null); reset(); setError(null)
  }

  function submit() {
    const cents = Math.round(parseFloat(amount) * 100)
    if (!description.trim()) { setError('Enter a description.'); return }
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    setError(null)
    startTransition(async () => {
      const common = {
        leagueId, category, description, amountCents: cents,
        source: source || undefined, receivedOn: receivedOn || null,
      }
      const res = isNew
        ? await addEventRevenue(common)
        : await updateEventRevenue({ ...common, revenueId: editing! })
      if (res.error) { setError(res.error); return }
      close(); router.refresh()
    })
  }

  function remove(id: string) {
    if (!confirm('Delete this income entry?')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteEventRevenue(id, leagueId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  const form = (
    <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value as RevenueCategory)} className="border rounded px-2 py-1.5 text-sm bg-white">
          {REVENUE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border rounded pl-5 pr-2 py-1.5 text-sm" />
        </div>
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. 50/50 draw — week 3)" className="w-full border rounded px-2 py-1.5 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source / donor (optional)" className="border rounded px-2 py-1.5 text-sm" />
        <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="border rounded px-2 py-1.5 text-sm text-gray-600" />
      </div>
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
          <h2 className="text-lg font-semibold text-gray-900">Other income</h2>
          <p className="text-xs text-gray-400">Donations, 50/50 draws, sponsorships, concessions, fundraisers…</p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={() => { reset(); setEditing('new') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-4 h-4" /> Add income
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {isNew && form}

      {initialRevenue.length === 0 && !isNew ? (
        <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
          No other income logged yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-50">
              {initialRevenue.map((e) => (
                editing === e.id ? (
                  <tr key={e.id}>
                    <td colSpan={3} className="p-2">{form}</td>
                  </tr>
                ) : (
                <tr key={e.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{e.description}</p>
                    <p className="text-xs text-gray-400">
                      {CATEGORY_LABELS[e.category]}
                      {e.source ? ` · ${e.source}` : ''}
                      {e.received_on ? ` · ${new Date(e.received_on).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700 whitespace-nowrap">{money(e.amount_cents)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(e)} disabled={pending} className="text-gray-400 hover:text-gray-700 disabled:opacity-40 p-2 -my-2" aria-label="Edit income">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(e.id)} disabled={pending} className="text-gray-400 hover:text-red-600 disabled:opacity-40 p-2 -my-2" aria-label="Delete income">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                )
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                <td className="px-4 py-2.5">Total other income</td>
                <td className="px-4 py-2.5 text-right text-green-700">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
