'use client'

import { useState } from 'react'

interface Props {
  teamId: string
  leagueId: string
  leagueSlug: string
  orgId: string
  priceCents: number
  currency: string
  memberCount: number
  isPaid: boolean
  paidAt?: string | null
  timezone?: string
}

export function TeamPaymentPanel({
  teamId,
  leagueId,
  leagueSlug,
  orgId,
  priceCents,
  currency,
  memberCount,
  isPaid,
  paidAt,
  timezone = 'UTC',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, leagueSlug, teamId, orgId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const price = priceCents / 100
  const curr = currency.toUpperCase()

  if (isPaid) {
    return (
      <div className="mt-6 bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Team Payment</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Paid
          </span>
        </div>
        <div className="px-5 py-4 text-sm text-gray-500">
          <p>
            Team payment of <strong className="text-gray-800">${price.toFixed(0)} {curr}</strong> received.
            {paidAt && (
              <> Paid on {new Date(paidAt).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: timezone })}.</>
            )}
          </p>
          <p className="mt-1">All {memberCount} registered player{memberCount !== 1 ? 's' : ''} are confirmed for this event.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Team Payment</h2>
        <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          Payment required
        </span>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between py-3 border rounded-md px-4">
          <div>
            <p className="font-medium text-sm">Team registration fee</p>
            <p className="text-xs text-gray-400 mt-0.5">{memberCount} player{memberCount !== 1 ? 's' : ''} currently on the roster</p>
          </div>
          <p className="font-bold text-lg" style={{ color: 'var(--brand-primary)' }}>
            ${price.toFixed(0)} {curr}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Redirecting to checkout…' : `Pay $${price.toFixed(0)} ${curr} for Team →`}
        </button>

        <p className="text-xs text-center text-gray-400">
          Secure checkout via Stripe. Once payment is complete, all team members&apos; registrations will be activated automatically.
        </p>
      </div>
    </div>
  )
}
