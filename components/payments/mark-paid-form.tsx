'use client'

import { useState, useTransition } from 'react'
import { recordManualPayment } from '@/actions/payments'

interface Props {
  registrationId: string
  userId: string
  leagueId: string
  amountCents: number
  currency: string
}

export function MarkPaidForm({ registrationId, userId, leagueId, amountCents, currency }: Props) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'cash' | 'etransfer'>('etransfer')
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await recordManualPayment({
        registrationId,
        userId,
        leagueId,
        amountCents: Math.round(parseFloat(amount) * 100),
        currency,
        method,
        notes: notes || undefined,
      })
      if (result.error) setError(result.error)
      else setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1 rounded-md border font-medium text-gray-700 hover:bg-gray-50"
      >
        Mark as Paid
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 min-w-[220px]">
      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value as 'cash' | 'etransfer')}
          className="border rounded px-2 py-1 text-xs flex-1"
        >
          <option value="etransfer">e-Transfer</option>
          <option value="cash">Cash</option>
        </select>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="border rounded px-2 py-1 text-xs w-20"
        />
      </div>
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-3 py-1 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {pending ? 'Saving…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1 rounded-md border text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
