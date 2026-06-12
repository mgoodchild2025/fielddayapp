'use client'

import { useState, useTransition } from 'react'
import { adminUpdateRegistrationPayment } from '@/actions/payments'

type Status = 'paid' | 'pending' | 'refunded'
type Method = 'cash' | 'etransfer' | 'cheque' | 'stripe' | 'card' | 'other'

interface Props {
  registrationId: string
  hasPayment: boolean
  /** Pre-fill amount (current payment amount, or the event price for a first record). */
  defaultAmountCents: number
  defaultStatus?: Status
  defaultMethod?: Method
  defaultNotes?: string | null
}

export function EditPaymentForm({
  registrationId, hasPayment, defaultAmountCents, defaultStatus = 'paid', defaultMethod = 'etransfer', defaultNotes,
}: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [method, setMethod] = useState<Method>(defaultMethod)
  const [amount, setAmount] = useState((defaultAmountCents / 100).toFixed(2))
  const [notes, setNotes] = useState(defaultNotes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cents = Math.round(parseFloat(amount) * 100)
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    startTransition(async () => {
      const res = await adminUpdateRegistrationPayment({
        registrationId, amountCents: cents, status, method, notes: notes || undefined,
      })
      if (res.error) setError(res.error)
      else setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1 rounded-md border font-medium text-gray-700 hover:bg-gray-50"
      >
        {hasPayment ? 'Edit payment' : 'Record payment'}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 min-w-[230px]">
      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="border rounded px-2 py-1 text-xs flex-1">
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
        </select>
        <div className="relative w-24">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded pl-5 pr-1.5 py-1 text-xs w-full" aria-label="Amount" />
        </div>
      </div>
      <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="border rounded px-2 py-1 text-xs">
        <option value="etransfer">e-Transfer</option>
        <option value="cash">Cash</option>
        <option value="cheque">Cheque</option>
        <option value="card">Card (in person)</option>
        <option value="stripe">Stripe</option>
        <option value="other">Other</option>
      </select>
      <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded px-2 py-1 text-xs" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="text-xs px-3 py-1 rounded-md font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs px-3 py-1 rounded-md border text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}
