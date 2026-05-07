'use client'

import { useState } from 'react'
import type { Database } from '@/types/database'
import type { MerchSelection, MerchItemForStep } from './step-addons'

type League = Database['public']['Tables']['leagues']['Row']

interface Props {
  org: { id: string; slug: string }
  league: League
  userId: string
  registrationId: string
  priceCents?: number
  merchSelections?: MerchSelection[]
  leagueMerch?: MerchItemForStep[]
  onBack?: () => void
}

export function Step3Payment({ org, league, userId, registrationId, priceCents, merchSelections = [], leagueMerch = [], onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registrationPriceCents = priceCents ?? league.price_cents
  const currency = league.currency.toUpperCase()

  // Build merch line item display data
  const merchLineItems = merchSelections.map((sel) => {
    const item = leagueMerch.find((i) => i.id === sel.itemId)
    const variant = item?.variants.find((v) => v.id === sel.variantId)
    return {
      itemId: sel.itemId,
      variantId: sel.variantId,
      quantity: sel.quantity,
      name: item?.name ?? 'Item',
      variantLabel: variant?.label ?? null,
      unitPriceCents: item?.price_cents ?? 0,
    }
  }).filter((li) => li.quantity > 0)

  const merchTotalCents = merchLineItems.reduce(
    (sum, li) => sum + li.unitPriceCents * li.quantity,
    0
  )
  const totalCents = registrationPriceCents + merchTotalCents

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        leagueId: league.id,
        leagueSlug: league.slug,
        userId,
        registrationId,
        orgId: org.id,
      }

      if (merchSelections.length > 0) {
        body.merchSelections = merchSelections.map((sel) => ({
          itemId: sel.itemId,
          variantId: sel.variantId,
          quantity: sel.quantity,
        }))
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const registrationPrice = registrationPriceCents / 100

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

        <div className="border rounded-md divide-y">
          {/* Registration fee — omit when free */}
          {registrationPriceCents > 0 && (
            <div className="flex justify-between items-center px-4 py-3">
              <div>
                <span className="font-medium">{league.name}</span>
                <p className="text-xs text-gray-400 mt-0.5">Registration fee</p>
              </div>
              <span className="font-bold text-lg tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                ${registrationPrice.toFixed(0)} {currency}
              </span>
            </div>
          )}

          {/* Merchandise line items */}
          {merchLineItems.map((li) => (
            <div key={`${li.itemId}-${li.variantId ?? 'none'}`} className="flex justify-between items-center px-4 py-3">
              <div>
                <span className="font-medium text-sm">{li.name}</span>
                {li.variantLabel && (
                  <span className="text-xs text-gray-500 ml-1.5">{li.variantLabel}</span>
                )}
                {li.quantity > 1 && (
                  <span className="text-xs text-gray-400 ml-1">× {li.quantity}</span>
                )}
                <p className="text-xs text-gray-400 mt-0.5">Merchandise</p>
              </div>
              <span className="font-semibold text-sm tabular-nums text-gray-800">
                ${((li.unitPriceCents * li.quantity) / 100).toFixed(2)} {currency}
              </span>
            </div>
          ))}

          {/* Total row (only when merch adds to the total) */}
          {merchTotalCents > 0 && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50">
              <span className="font-semibold text-sm text-gray-700">Total</span>
              <span className="font-bold text-xl tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                ${(totalCents / 100).toFixed(2)} {currency}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading
            ? 'Redirecting to checkout…'
            : `Pay $${(totalCents / 100).toFixed(0)} ${currency} →`}
        </button>

        <p className="text-xs text-center text-gray-400">
          Secure checkout powered by Stripe. Your payment info is never stored on our servers.
        </p>
      </div>
    </div>
  )
}
