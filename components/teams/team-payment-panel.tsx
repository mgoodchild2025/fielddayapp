'use client'

import { useState } from 'react'
import { selectOfflineTeamPayment } from '@/actions/payments'
import { validateDiscountCode, incrementDiscountUse } from '@/actions/discounts'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ICON, type PaymentMethod } from '@/lib/payment-methods'

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
  captainRegistrationStatus?: string // 'none' | 'pending' | 'active' | ...
  /** Per-league accepted methods. When >1, the captain chooses; offline reserves the team. */
  acceptedMethods?: PaymentMethod[]
  offlineInstructions?: string | null
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
  captainRegistrationStatus = 'none',
  acceptedMethods = [],
  offlineInstructions = null,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualInstructions, setManualInstructions] = useState<string | null>(null)

  // Discount code
  const [discountInput, setDiscountInput] = useState('')
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    id: string; code: string; type: 'percent' | 'fixed'; value: number
  } | null>(null)
  const [showDiscountInput, setShowDiscountInput] = useState(false)

  const discountAmountCents = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round(priceCents * appliedDiscount.value / 100)
      : Math.min(appliedDiscount.value * 100, priceCents)
    : 0
  const discountedPriceCents = priceCents - discountAmountCents

  const choice = acceptedMethods.length > 0
  const selectableMethods: PaymentMethod[] = choice ? acceptedMethods : ['card']
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    () => (selectableMethods.includes('card') ? 'card' : (selectableMethods[0] ?? 'card'))
  )

  async function handleApplyDiscount() {
    const code = discountInput.trim()
    if (!code) return
    setDiscountLoading(true)
    setDiscountError(null)
    const result = await validateDiscountCode(code, orgId, 'leagues')
    setDiscountLoading(false)
    if (result.valid && result.discount) {
      setAppliedDiscount(result.discount)
    } else {
      setDiscountError(result.error ?? 'Invalid code')
    }
  }

  async function handleOfflineTeam(method: PaymentMethod) {
    setLoading(true)
    setError(null)
    try {
      const res = await selectOfflineTeamPayment({
        teamId,
        leagueId,
        method: method as 'etransfer' | 'cash' | 'cheque',
      })
      if (res.error) {
        setError(res.error)
        setLoading(false)
      } else {
        if (appliedDiscount) await incrementDiscountUse(appliedDiscount.id)
        setManualInstructions(res.instructions ?? offlineInstructions ?? '')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function handlePrimary() {
    if (!choice || selectedMethod === 'card') handleCheckout()
    else handleOfflineTeam(selectedMethod)
  }

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId, leagueSlug, teamId, orgId,
          ...(appliedDiscount ? { discountId: appliedDiscount.id } : {}),
        }),
      })
      const data = await res.json()
      if (data.manual) {
        setManualInstructions(data.instructions ?? '')
        setLoading(false)
      } else if (data.url) {
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

  if (manualInstructions !== null) {
    return (
      <div className="mt-6 bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <h2 className="font-semibold">Team registered!</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-900">Payment instructions</p>
            {manualInstructions ? (
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{manualInstructions}</p>
            ) : (
              <p className="text-sm text-amber-700">Please contact the organizer to arrange payment.</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Your team&apos;s spot is reserved. The organizer will confirm once payment is received.
          </p>
        </div>
      </div>
    )
  }

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

  const needsToRegister = captainRegistrationStatus === 'none'

  return (
    <div className="mt-6 bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Team Payment</h2>
        <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          Payment required
        </span>
      </div>
      <div className="px-5 py-4 space-y-4">

        {/* Gate: captain must register before paying */}
        {needsToRegister ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-blue-800">Register yourself first</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  As captain, you need to complete your own registration before paying for the team. Your registration is how we confirm your spot on the roster.
                </p>
              </div>
            </div>
            <a
              href={`/register/${leagueSlug}`}
              className="block w-full text-center py-2.5 rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Register for this event →
            </a>
          </div>
        ) : (
          <>
            <div className="border rounded-md divide-y">
              <div className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium text-sm">Team registration fee</p>
                  <p className="text-xs text-gray-400 mt-0.5">{memberCount} player{memberCount !== 1 ? 's' : ''} currently on the roster</p>
                </div>
                <p className={`font-bold text-lg tabular-nums ${appliedDiscount ? 'line-through text-gray-400' : ''}`} style={appliedDiscount ? {} : { color: 'var(--brand-primary)' }}>
                  ${price.toFixed(0)} {curr}
                </p>
              </div>

              {appliedDiscount && discountAmountCents > 0 && (
                <div className="flex justify-between items-center px-4 py-3 bg-green-50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-green-800">Discount: {appliedDiscount.code}</span>
                    <span className="text-xs text-green-600 bg-green-100 rounded px-1.5 py-0.5">
                      {appliedDiscount.type === 'percent' ? `${appliedDiscount.value}% off` : `$${appliedDiscount.value} off`}
                    </span>
                    <button type="button" onClick={() => { setAppliedDiscount(null); setDiscountInput('') }} className="text-xs text-green-600 hover:text-red-500 underline">
                      Remove
                    </button>
                  </div>
                  <span className="font-semibold text-green-700 tabular-nums">−${(discountAmountCents / 100).toFixed(2)} {curr}</span>
                </div>
              )}

              {appliedDiscount && (
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-600">After discount</span>
                  <span className="font-bold text-lg tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                    ${(discountedPriceCents / 100).toFixed(2)} {curr}
                  </span>
                </div>
              )}
            </div>

            {/* Discount code */}
            {!appliedDiscount && (
              <div>
                {!showDiscountInput ? (
                  <button type="button" onClick={() => setShowDiscountInput(true)} className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2">
                    Have a discount code?
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountInput}
                        onChange={(e) => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(null) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyDiscount() } }}
                        placeholder="Enter code"
                        className="flex-1 border rounded-md px-3 py-2 text-sm uppercase tracking-wider focus:outline-none focus:ring-2"
                        style={{ focusRingColor: 'var(--brand-primary)' } as React.CSSProperties}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        disabled={discountLoading || !discountInput.trim()}
                        className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {discountLoading ? '…' : 'Apply'}
                      </button>
                      <button type="button" onClick={() => { setShowDiscountInput(false); setDiscountInput(''); setDiscountError(null) }} className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    {discountError && <p className="text-xs text-red-600">{discountError}</p>}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
            )}

            {/* Method chooser — when the league accepts more than one */}
            {choice && selectableMethods.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Choose how to pay</p>
                <div className="grid gap-2">
                  {selectableMethods.map((m) => {
                    const active = selectedMethod === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMethod(m)}
                        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                          active ? 'border-transparent ring-2' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        style={active ? { boxShadow: '0 0 0 2px var(--brand-primary)' } : {}}
                      >
                        <span className="text-xl">{PAYMENT_METHOD_ICON[m]}</span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-gray-900">{PAYMENT_METHOD_LABELS[m]}</span>
                          <span className="block text-xs text-gray-500">
                            {m === 'card' ? 'Pay now by card' : 'Reserve your team, pay the organizer directly'}
                          </span>
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border-2 ${active ? 'border-transparent' : 'border-gray-300'}`}
                          style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handlePrimary}
              disabled={loading}
              className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {loading
                ? (selectedMethod === 'card' ? 'Redirecting to checkout…' : 'Saving…')
                : selectedMethod === 'card'
                  ? `Pay $${(discountedPriceCents / 100).toFixed(appliedDiscount ? 2 : 0)} ${curr} for Team →`
                  : `Reserve team & pay by ${PAYMENT_METHOD_LABELS[selectedMethod]} →`}
            </button>

            {selectedMethod === 'card' && (
              <p className="text-xs text-center text-gray-400">
                Secure checkout via Stripe. Once payment is complete, all team members&apos; registrations will be activated automatically.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
