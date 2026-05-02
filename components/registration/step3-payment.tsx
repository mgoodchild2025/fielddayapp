'use client'

import { useState } from 'react'
import type { Database } from '@/types/database'

type League = Database['public']['Tables']['leagues']['Row']

interface Props {
  org: { id: string; slug: string }
  league: League
  userId: string
  registrationId: string
  priceCents?: number
  onBack?: () => void
}

export function Step3Payment({ org, league, userId, registrationId, priceCents, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId: league.id,
          leagueSlug: league.slug,
          userId,
          registrationId,
          orgId: org.id,
        }),
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

  const price = (priceCents ?? league.price_cents) / 100
  const currency = league.currency.toUpperCase()

  return (
    <div className="space-y-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <h2 className="font-semibold text-lg">Payment</h2>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

      <div className="border rounded-md p-4">
        <div className="flex justify-between items-center">
          <span className="font-medium">{league.name}</span>
          <span className="font-bold text-lg" style={{ color: 'var(--brand-primary)' }}>
            ${price.toFixed(0)} {currency}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Registration fee</p>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Redirecting to checkout…' : `Pay $${price.toFixed(0)} ${currency} →`}
      </button>

      <p className="text-xs text-center text-gray-400">
        Secure checkout powered by Stripe. Your payment info is never stored on our servers.
      </p>
    </div>
    </div>
  )
}
