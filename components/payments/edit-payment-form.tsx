'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminUpdateRegistrationPayment, adminUpdateTeamPayment } from '@/actions/payments'
import { Overlay } from '@/components/ui/overlay'

type Status = 'paid' | 'pending' | 'refunded'
type Method = 'cash' | 'etransfer' | 'cheque' | 'stripe' | 'card' | 'other'

/** Whose payment this is: a player's registration, or a per-team event's team fee. */
type Target = { registrationId: string } | { teamId: string; leagueId: string }

type Props = Target & {
  hasPayment: boolean
  /** Pre-fill amount (current payment amount, or the event price for a first record). */
  defaultAmountCents: number
  defaultStatus?: Status
  defaultMethod?: Method
  defaultNotes?: string | null
  /** Refund already recorded — pre-fills the refund box, so re-saving a
   *  partial refund can't silently turn it into a full one. */
  defaultRefundCents?: number | null
  /** Custom closed-state trigger (e.g. the payment badge). Defaults to a button. */
  trigger?: React.ReactNode
  /** Who the payment belongs to — the sheet's heading ("Payment · Sam Lee"). */
  payerName?: string
}

/**
 * The payment badge (or a button) that opens the editor in a sheet — a bottom
 * sheet on phones, a dialog on larger screens. It used to expand inline inside
 * the table cell, squeezing the player's name to a sliver on a phone.
 */
export function EditPaymentForm(props: Props) {
  const { hasPayment, trigger, payerName } = props
  const [open, setOpen] = useState(false)
  // Bumped per open: the fields remount fresh each time, but stay rendered
  // while the sheet plays its exit.
  const [session, setSession] = useState(0)
  const show = () => { setSession((n) => n + 1); setOpen(true) }

  return (
    <>
      {trigger ? (
        <button
          type="button"
          onClick={show}
          className="press inline-flex items-center gap-1 text-left min-h-10 -my-2"
          title="Edit payment"
        >
          {trigger}
          {/* Visible affordance — on touch screens nothing else says the badge is tappable. */}
          <Pencil className="w-3 h-3 text-gray-400" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={show}
          className="press text-xs min-h-10 px-3 rounded-md border font-medium text-gray-700 hover:bg-gray-50"
        >
          {hasPayment ? 'Edit payment' : 'Record payment'}
        </button>
      )}

      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        labelledBy="edit-payment-title"
        panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="edit-payment-title" className="text-lg font-semibold text-gray-900">
              {hasPayment ? 'Edit payment' : 'Record payment'}
            </h2>
            {payerName && <p className="text-sm text-gray-500 truncate">{payerName}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press -mr-2 -mt-1 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Remounts per open, so a cancelled edit never lingers. */}
        {session > 0 && <PaymentFields key={session} {...props} onDone={() => setOpen(false)} />}
      </Overlay>
    </>
  )
}

const FIELD = 'w-full min-h-11 border rounded-md px-3 text-base sm:text-sm bg-white'

function PaymentFields(props: Props & { onDone: () => void }) {
  const { defaultAmountCents, defaultStatus = 'paid', defaultMethod = 'etransfer', defaultNotes, defaultRefundCents, payerName, onDone } = props
  const router = useRouter()
  const [status, setStatus] = useState<Status>(defaultStatus)
  const [method, setMethod] = useState<Method>(defaultMethod)
  const [amount, setAmount] = useState((defaultAmountCents / 100).toFixed(2))
  const [notes, setNotes] = useState(defaultNotes ?? '')
  const [refundAmount, setRefundAmount] = useState(
    defaultStatus === 'refunded' && (defaultRefundCents ?? 0) > 0 ? ((defaultRefundCents ?? 0) / 100).toFixed(2) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cents = Math.round(parseFloat(amount) * 100)
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount.'); return }
    const refundCents = status === 'refunded' && refundAmount.trim()
      ? Math.round(parseFloat(refundAmount) * 100)
      : undefined
    if (status === 'refunded' && refundCents !== undefined && (isNaN(refundCents) || refundCents < 0)) {
      setError('Enter a valid refund amount.'); return
    }
    startTransition(async () => {
      const fields = { amountCents: cents, status, method, notes: notes || undefined, refundAmountCents: refundCents }
      const res = 'teamId' in props
        ? await adminUpdateTeamPayment({ teamId: props.teamId, leagueId: props.leagueId, ...fields })
        : await adminUpdateRegistrationPayment({ registrationId: props.registrationId, ...fields })
      if (res.error) { setError(res.error); return }
      // The sheet closes, so say it somewhere that stays on screen.
      toast.success(payerName ? `Payment saved · ${payerName}` : 'Payment saved')
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-gray-600">Status
          <select data-autofocus value={status} onChange={(e) => setStatus(e.target.value as Status)} className={`mt-1 ${FIELD}`}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">Amount
          <span className="relative mt-1 block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD} pl-6`} />
          </span>
        </label>
      </div>
      {status === 'refunded' && (
        <label className="block text-xs font-medium text-gray-600">Refund amount
          <span className="relative mt-1 block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
            <input
              type="number" inputMode="decimal" step="0.01" min="0"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={`Blank = full ${amount}`}
              className={`${FIELD} pl-6`}
            />
          </span>
        </label>
      )}
      <label className="block text-xs font-medium text-gray-600">Method
        <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={`mt-1 ${FIELD}`}>
          <option value="etransfer">e-Transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="card">Card (in person)</option>
          <option value="stripe">Stripe</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-gray-600">Notes
        <input type="text" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${FIELD}`} />
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="press flex-1 min-h-11 rounded-lg text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="press min-h-11 px-4 rounded-lg border text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}
