'use client'

import { useState } from 'react'
import type { Database } from '@/types/database'
import type { MerchSelection, MerchItemForStep } from './step-addons'
import { selectOfflinePayment, selectOfflineTeamPayment } from '@/actions/payments'
import { validateDiscountCode, incrementDiscountUse } from '@/actions/discounts'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ICON,
  type PaymentMethod,
} from '@/lib/payment-methods'

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
  /** Methods the player may choose from. When unset/empty, falls back to the
   *  legacy single "Pay" button (Stripe, with manual fallback from the API). */
  acceptedMethods?: PaymentMethod[]
  /** Offline payment instructions (per-league with org fallback). */
  offlineInstructions?: string | null
  /** Called after an offline method is confirmed (registration already reserved). */
  onComplete?: () => void
  /** When set, this is a per-team captain paying the team fee: card uses the team
   *  checkout, offline reserves the whole team. */
  teamId?: string | null
}

export function Step3Payment({ org, league, userId, registrationId, priceCents, merchSelections = [], leagueMerch = [], onBack, acceptedMethods = [], offlineInstructions = null, onComplete, teamId = null }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualInstructions, setManualInstructions] = useState<string | null>(null)
  const [offlineDone, setOfflineDone] = useState<{ instructions: string | null; label: string } | null>(null)

  // Discount code
  const [discountInput, setDiscountInput] = useState('')
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    id: string; code: string; type: 'percent' | 'fixed'; value: number
  } | null>(null)
  const [showDiscountInput, setShowDiscountInput] = useState(false)

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

  // Discount
  const discountAmountCents = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round(registrationPriceCents * appliedDiscount.value / 100)
      : Math.min(appliedDiscount.value * 100, registrationPriceCents)
    : 0
  const discountedRegistrationCents = registrationPriceCents - discountAmountCents
  const totalCents = discountedRegistrationCents + merchTotalCents

  // ── Payment method selection ────────────────────────────────────────────────
  // Merchandise can only be charged online, so offline methods are hidden when
  // the cart has merch.
  const merchBlocksOffline = merchTotalCents > 0
  const choice = acceptedMethods.length > 0
  const selectableMethods: PaymentMethod[] = choice
    ? acceptedMethods.filter((m) => m === 'card' || !merchBlocksOffline)
    : ['card']
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    () => (selectableMethods.includes('card') ? 'card' : (selectableMethods[0] ?? 'card'))
  )

  async function handleApplyDiscount() {
    const code = discountInput.trim()
    if (!code) return
    setDiscountLoading(true)
    setDiscountError(null)
    // Determine context: drop-in vs league
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = ((league as any).event_type === 'drop_in' || (league as any).event_type === 'pickup' || league.league_type === 'dropin') ? 'dropins' : 'leagues'
    const result = await validateDiscountCode(code, org.id, ctx, league.id)
    setDiscountLoading(false)
    if (result.valid && result.discount) {
      setAppliedDiscount(result.discount)
      setDiscountError(null)
    } else {
      setDiscountError(result.error ?? 'Invalid code')
    }
  }

  async function handleOffline(method: PaymentMethod) {
    setLoading(true)
    setError(null)
    try {
      const res = teamId
        ? await selectOfflineTeamPayment({ teamId, leagueId: league.id, method: method as 'etransfer' | 'cash' | 'cheque', discountedAmountCents: appliedDiscount ? discountedRegistrationCents : undefined })
        : await selectOfflinePayment({ registrationId, leagueId: league.id, method: method as 'etransfer' | 'cash' | 'cheque', discountedAmountCents: appliedDiscount ? discountedRegistrationCents : undefined })
      if (res.error) {
        setError(res.error)
        setLoading(false)
      } else {
        // Offline: increment discount use count now that the spot is reserved
        if (appliedDiscount) await incrementDiscountUse(appliedDiscount.id)
        setOfflineDone({ instructions: res.instructions ?? offlineInstructions, label: res.methodLabel })
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function handleContinue() {
    if (selectedMethod === 'card') handleCheckout()
    else handleOffline(selectedMethod)
  }

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
        ...(appliedDiscount ? { discountId: appliedDiscount.id } : {}),
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
      if (data.manual) {
        setManualInstructions(data.instructions ?? '')
        setLoading(false)
      } else if (data.url) {
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

  // Offline method confirmed — spot reserved, show payment instructions
  if (offlineDone) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="font-semibold text-lg">You&apos;re registered!</h2>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-900">
              Pay by {offlineDone.label} — ${(registrationPriceCents / 100).toFixed(2)} {currency}
            </p>
            {offlineDone.instructions ? (
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{offlineDone.instructions}</p>
            ) : (
              <p className="text-sm text-amber-700">Please contact the organizer to arrange payment.</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Make a note of these instructions. Click below to finish — the organizer will mark your
            payment as received once it arrives.
          </p>
          <button
            type="button"
            onClick={() => onComplete?.()}
            className="w-full py-3 rounded-md font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Finish registration →
          </button>
        </div>
      </div>
    )
  }

  // Manual payment — show instructions instead of Stripe button
  if (manualInstructions !== null) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h2 className="font-semibold text-lg">You&apos;re registered!</h2>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-900">Payment instructions</p>
            {manualInstructions ? (
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{manualInstructions}</p>
            ) : (
              <p className="text-sm text-amber-700">Please contact the organizer to arrange payment.</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Your spot is reserved. The organizer will confirm your registration once payment is received.
          </p>
        </div>
      </div>
    )
  }

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
              <span className={`font-bold text-lg tabular-nums ${appliedDiscount ? 'line-through text-gray-400' : ''}`} style={appliedDiscount ? {} : { color: 'var(--brand-primary)' }}>
                ${registrationPrice.toFixed(0)} {currency}
              </span>
            </div>
          )}

          {/* Discount line */}
          {appliedDiscount && discountAmountCents > 0 && (
            <div className="flex justify-between items-center px-4 py-3 bg-green-50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-green-800">
                  Discount: {appliedDiscount.code}
                </span>
                <span className="text-xs text-green-600 bg-green-100 rounded px-1.5 py-0.5">
                  {appliedDiscount.type === 'percent' ? `${appliedDiscount.value}% off` : `$${appliedDiscount.value} off`}
                </span>
                <button
                  type="button"
                  onClick={() => { setAppliedDiscount(null); setDiscountInput('') }}
                  className="text-xs text-green-600 hover:text-red-500 underline"
                >
                  Remove
                </button>
              </div>
              <span className="font-semibold text-green-700 tabular-nums">
                −${(discountAmountCents / 100).toFixed(2)} {currency}
              </span>
            </div>
          )}

          {/* Discounted registration total (when discount applied) */}
          {appliedDiscount && registrationPriceCents > 0 && (
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-600">After discount</span>
              <span className="font-bold text-lg tabular-nums" style={{ color: 'var(--brand-primary)' }}>
                ${(discountedRegistrationCents / 100).toFixed(2)} {currency}
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

        {/* Discount code — only when there's a registration fee and no discount applied yet */}
        {registrationPriceCents > 0 && !appliedDiscount && (
          <div>
            {!showDiscountInput ? (
              <button
                type="button"
                onClick={() => setShowDiscountInput(true)}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
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
                  <button
                    type="button"
                    onClick={() => { setShowDiscountInput(false); setDiscountInput(''); setDiscountError(null) }}
                    className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                {discountError && (
                  <p className="text-xs text-red-600">{discountError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment method chooser — shown when the league accepts more than one */}
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
                        {m === 'card' ? 'Pay now by card' : 'Reserve your spot, pay the organizer directly'}
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
            {merchBlocksOffline && (
              <p className="text-xs text-gray-400">Merchandise must be paid online by card.</p>
            )}
          </div>
        )}

        <button
          onClick={choice ? handleContinue : handleCheckout}
          disabled={loading}
          className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading
            ? (selectedMethod === 'card' ? 'Redirecting to checkout…' : 'Saving…')
            : selectedMethod === 'card'
              ? `Pay $${(totalCents / 100).toFixed(0)} ${currency} →`
              : `Register & pay by ${PAYMENT_METHOD_LABELS[selectedMethod]} →`}
        </button>

        {selectedMethod === 'card' && (
          <p className="text-xs text-center text-gray-400">
            Secure checkout powered by Stripe. Your payment info is never stored on our servers.
          </p>
        )}
      </div>
    </div>
  )
}
