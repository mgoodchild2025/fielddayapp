'use client'

// Date-only columns: formatDateOnly reads them as calendar dates. new Date('2026-10-04')
// is midnight UTC — the evening before in the Americas, and server/phone disagreed.
import { formatDateOnly } from '@/lib/format-time'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { addEventRevenue, updateEventRevenue, deleteEventRevenue } from '@/actions/finances'
import type { EventRevenue } from '@/actions/finances'
import { REVENUE_CATEGORIES, type RevenueCategory } from '@/lib/finance-constants'
import { useUndoableRemove } from '@/components/ui/use-undoable-remove'
import { Overlay } from '@/components/ui/overlay'

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
  const { isHidden, remove: removeWithUndo } = useUndoableRemove()
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

  // Don't clear the fields here: the sheet animates out with them showing.
  // Opening "Add" resets; editing fills them.
  function close() {
    setEditing(null); setError(null)
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

  // Hidden at once with Undo; deleted only when Undo expires.
  function remove(id: string) {
    setError(null)
    removeWithUndo(id, {
      label: 'Income entry deleted',
      commit: () => deleteEventRevenue(id, leagueId),
      onCommitted: () => router.refresh(),
    })
  }

  const form = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <FormField label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as RevenueCategory)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white">
            {REVENUE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </FormField>
        <FormField label="Amount">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">$</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full min-h-10 border rounded-md pl-6 pr-2.5 text-sm bg-white" />
          </div>
        </FormField>
      </div>
      <FormField label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 50/50 draw — week 3" className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
      </FormField>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <FormField label="Source / donor (optional)">
          <input value={source} onChange={(e) => setSource(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
        </FormField>
        <FormField label="Date received">
          <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
        </FormField>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={close} className="press min-h-10 px-4 rounded-md border text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={submit} disabled={pending} className="press min-h-10 px-4 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60">
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
            className="press inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-md text-sm font-semibold bg-brand-primary text-on-brand"
          >
            <Plus className="w-4 h-4" /> Add income
          </button>
        )}
      </div>



      {initialRevenue.length === 0 && !isNew ? (
        <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
          No other income logged yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-50">
              {initialRevenue.filter((e) => !isHidden(e.id)).map((e) => (
                <tr key={e.id} className={`hover:bg-gray-50/50 ${editing === e.id ? 'bg-gray-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{e.description}</p>
                    <p className="text-xs text-gray-400">
                      {CATEGORY_LABELS[e.category]}
                      {e.source ? ` · ${e.source}` : ''}
                      {e.received_on ? ` · ${formatDateOnly(e.received_on)}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700 whitespace-nowrap">{money(e.amount_cents)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(e)} disabled={pending} className="press inline-flex items-center justify-center w-10 h-10 -my-2 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-40" aria-label="Edit income">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(e.id)} disabled={pending} className="press inline-flex items-center justify-center w-10 h-10 -my-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Delete income">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
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

      {/* Add / edit in a sheet — the form used to expand inside the table row. */}
      <Overlay
        open={editing !== null}
        onClose={close}
        variant="sheet"
        labelledBy="revenue-sheet-title"
        panelClassName="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 max-h-[92dvh] overflow-y-auto"
      >
        <h3 id="revenue-sheet-title" className="font-semibold text-gray-900 mb-3">{isNew ? 'Add income' : 'Edit income'}</h3>
        {error && <p role="alert" className="fd-fade-in mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</p>}
        {form}
      </Overlay>
    </div>
  )
}

// A visible label over each control (these forms were placeholder-only).
function FormField({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}
