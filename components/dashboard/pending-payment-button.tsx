'use client'

import { useState } from 'react'

interface Props {
  leagueId: string
  leagueSlug: string
  registrationId: string
  orgId: string
  userId: string
  amountCents: number
  currency: string
}

export function PendingPaymentButton({ leagueId, leagueSlug, registrationId, orgId, userId, amountCents, currency }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, leagueSlug, registrationId, orgId, userId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const price = `$${(amountCents / 100).toFixed(0)} ${currency.toUpperCase()}`

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="mt-2 w-full py-2 px-3 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Redirecting…' : `Complete Payment — ${price} →`}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
