'use client'

// Date-only columns: formatDateOnly reads them as calendar dates. new Date('2026-10-04')
// is midnight UTC — the evening before in the Americas, and server/phone disagreed.
import { formatDateOnly } from '@/lib/format-time'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { addEventExpense, addEventExpensePerSession, updateEventExpense, deleteEventExpense } from '@/actions/finances'
import { AttachmentsControl } from '@/components/finances/receipt-control'
import { TaxCalc } from '@/components/finances/tax-calc'
import type { EventExpense } from '@/actions/finances'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/finance-constants'
import { useUndoableRemove } from '@/components/ui/use-undoable-remove'

export type ExpenseSession = { id: string; label: string }
const ALL_SESSIONS = '__all__'

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

export function EventExpensesManager({
  leagueId, initialExpenses, sessions = [], defaultTaxPct = 0,
}: {
  leagueId: string
  initialExpenses: EventExpense[]
  sessions?: ExpenseSession[]
  /** Org's combined active sales-tax rate — powers the one-tap "Calc X%" helper. */
  defaultTaxPct?: number
}) {
  const router = useRouter()
  const { isHidden, remove: removeWithUndo } = useUndoableRemove()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // null = form closed · 'new' = adding · otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null)

  const [category, setCategory] = useState<ExpenseCategory>('rental')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('')
  const [vendor, setVendor] = useState('')
  const [incurredOn, setIncurredOn] = useState('')
  // '' = whole event · ALL_SESSIONS = every session · otherwise a session id
  const [sessionScope, setSessionScope] = useState('')

  const hasSessions = sessions.length > 0
  const sessionLabels = new Map(sessions.map((s) => [s.id, s.label]))
  const total = initialExpenses.reduce((s, e) => s + e.amount_cents, 0)
  const totalTax = initialExpenses.reduce((s, e) => s + (e.tax_cents ?? 0), 0)
  const isNew = editing === 'new'

  function reset() {
    setCategory('rental'); setDescription(''); setAmount(''); setTax(''); setVendor(''); setIncurredOn(''); setSessionScope('')
  }

  function startEdit(e: EventExpense) {
    setCategory(e.category)
    setDescription(e.description)
    setAmount((e.amount_cents / 100).toFixed(2))
    setTax(e.tax_cents ? (e.tax_cents / 100).toFixed(2) : '')
    setVendor(e.vendor ?? '')
    setIncurredOn(e.incurred_on ?? '')
    setSessionScope(e.session_id ?? '')
    setError(null)
    setEditing(e.id)
  }

  function close() {
    setEditing(null); reset(); setError(null)
  }

  function submit() {
    const cents = Math.round(parseFloat(amount) * 100)
    const taxCents = tax.trim() === '' ? 0 : Math.round(parseFloat(tax) * 100)
    if (!description.trim()) { setError('Enter a description.'); return }
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    if (isNaN(taxCents) || taxCents < 0 || taxCents > cents) { setError('Tax must be between 0 and the amount.'); return }
    setError(null)
    startTransition(async () => {
      const common = {
        leagueId, category, description, amountCents: cents, taxCents,
        vendor: vendor || undefined, incurredOn: incurredOn || null,
        sessionId: sessionScope && sessionScope !== ALL_SESSIONS ? sessionScope : null,
      }
      const res = isNew
        ? sessionScope === ALL_SESSIONS
          ? await addEventExpensePerSession({ leagueId, category, description, amountCents: cents, vendor: vendor || undefined })
          : await addEventExpense(common)
        : await updateEventExpense({ ...common, expenseId: editing! })
      if (res.error) { setError(res.error); return }
      close(); router.refresh()
    })
  }

  // Hidden at once with Undo; the expense (and its attachments) is deleted
  // only when Undo expires.
  function remove(id: string) {
    setError(null)
    removeWithUndo(id, {
      label: 'Expense deleted',
      commit: () => deleteEventExpense(id, leagueId),
      onCommitted: () => router.refresh(),
    })
  }

  const form = (
    <div className="rounded-lg border bg-gray-50 p-3 space-y-3">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <FormField label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </FormField>
        <FormField label="Amount (total incl. tax)">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">$</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full min-h-10 border rounded-md pl-6 pr-2.5 text-sm bg-white" />
          </div>
        </FormField>
      </div>
      <FormField label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Court rental" className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
      </FormField>
      {hasSessions && (
        <FormField label="For">
          <select value={sessionScope} onChange={(e) => setSessionScope(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white">
            <option value="">Whole event</option>
            {isNew && <option value={ALL_SESSIONS}>Every session (×{sessions.length})</option>}
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </FormField>
      )}
      {sessionScope === ALL_SESSIONS ? (
        <>
          <p className="text-xs text-gray-500">Amount is charged <strong>per session</strong> — one entry is added for each of the {sessions.length} sessions.</p>
          <FormField label="Vendor (optional)">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
          </FormField>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <FormField label="Vendor (optional)">
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
            </FormField>
            <FormField label="Date">
              <input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} className="w-full min-h-10 border rounded-md px-2.5 text-sm bg-white" />
            </FormField>
          </div>
          {/* Recoverable tax paid — feeds the report's net remittance (collected − paid) */}
          <FormField label="Tax included (HST/GST) — optional">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">$</span>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" className="w-full min-h-10 border rounded-md pl-6 pr-2.5 text-sm bg-white" />
              </div>
              <TaxCalc amount={amount} defaultPct={defaultTaxPct} onCalc={setTax} />
            </div>
          </FormField>
          <p className="text-xs text-gray-500">Enter only the <em>recoverable</em> tax (HST/GST/QST). It&apos;s subtracted from tax collected on the financial report.</p>
        </>
      )}
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
        <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
        {editing === null && (
          <button
            type="button"
            onClick={() => { reset(); setEditing('new') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-4 h-4" /> Add expense
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {isNew && form}

      {initialExpenses.length === 0 && !isNew ? (
        <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
          No expenses yet. Log venue, referees, prizes — the P&L above updates as you go.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-50">
              {initialExpenses.filter((e) => !isHidden(e.id)).map((e) => (
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
                      {e.session_id ? ` · ${sessionLabels.get(e.session_id) ?? 'Session'}` : ''}
                      {e.vendor ? ` · ${e.vendor}` : ''}
                      {e.incurred_on ? ` · ${formatDateOnly(e.incurred_on)}` : ''}
                      {e.tax_cents ? ` · incl. ${money(e.tax_cents)} tax` : ''}
                    </p>
                    <div className="mt-0.5">
                      <AttachmentsControl kind="event" expenseId={e.id} attachments={e.attachments ?? []} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">{money(e.amount_cents)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(e)} disabled={pending} className="text-gray-400 hover:text-gray-700 disabled:opacity-40 p-2 -my-2" aria-label="Edit expense">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(e.id)} disabled={pending} className="text-gray-400 hover:text-red-600 disabled:opacity-40 p-2 -my-2" aria-label="Delete expense">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                )
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-gray-800">
                <td className="px-4 py-2.5">
                  Total expenses
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

// A visible label over each control: these forms were placeholder-only, so a
// filled-in field (or a date) gave no clue what it was.
function FormField({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}
