'use client'

import { useState } from 'react'
import { CreditCard, X } from 'lucide-react'

type SessionOption = { id: string; label: string }

interface Props {
  orgId: string
  leagueId: string
  sessions: SessionOption[]
  priceLabel: string   // e.g. "$15.00"
}

export function DropinWalkupPayment({ orgId, leagueId, sessions, priceLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  async function start() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/stripe/dropin-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId, leagueId,
          sessionId: sessionId || null,
          guestName: guestName.trim() || undefined,
          guestEmail: guestEmail.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok || !body.url) { setError(body.error ?? 'Could not start checkout.'); setBusy(false); return }
      // Send the organizer's device to the hosted checkout for the walk-up to pay.
      window.location.href = body.url
    } catch {
      setError('Could not start checkout. Please try again.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <CreditCard className="w-4 h-4" /> Take walk-up payment
      </button>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3 max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Walk-up payment · {priceLabel}</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-xs text-gray-500">
        Continue to a Stripe checkout the player can pay on this device — card, Apple&nbsp;Pay, or Google&nbsp;Pay.
        It registers them for the session and records the payment automatically.
      </p>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {sessions.length > 0 && (
        <label className="block text-xs font-medium text-gray-500">
          Session
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-2 text-sm bg-white">
            <option value="">No specific session</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-gray-500">
          Name <span className="text-gray-400">(optional)</span>
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-2 text-sm" placeholder="Walk-in" />
        </label>
        <label className="block text-xs font-medium text-gray-500">
          Email <span className="text-gray-400">(optional)</span>
          <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="mt-1 w-full border rounded-md px-2 py-2 text-sm" placeholder="for a receipt" />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={start} disabled={busy} className="px-3.5 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {busy ? 'Starting…' : 'Continue to payment'}
        </button>
      </div>
    </div>
  )
}
