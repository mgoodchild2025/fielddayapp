'use client'

import { useEffect, useRef, useState } from 'react'
import { LogIn, UserPlus, ArrowLeft } from 'lucide-react'
import { RichTextContent } from '@/components/ui/rich-text-content'
import { signWaiverAsGuest } from '@/actions/waivers'
import { registerGuestDropin } from '@/actions/registrations'
import { validateDiscountCode } from '@/actions/discounts'

type GuardianRelationship = 'parent' | 'legal_guardian'

interface SessionOption {
  id: string
  scheduled_at: string
  capacity: number | null
  registered_count: number
}

interface Props {
  org: { id: string; name: string; slug: string }
  league: { id: string; name: string; slug: string; sport: string | null }
  waiver: { id: string; title: string; content: string } | null
  sessions: SessionOption[]
  preselectedSessionId: string | null
  priceCents: number
  currency: string
  onlinePayments: boolean
  manualInstructions: string | null
  timezone: string
  loginHref: string
  /** Invite-only events: the invited email (prefilled + locked) and its token */
  lockedEmail?: string | null
  inviteToken?: string | null
}

type Stage = 'choice' | 'details' | 'waiver' | 'submitting'

export function GuestRegistrationFlow({
  org, league, waiver, sessions, preselectedSessionId,
  priceCents, currency, onlinePayments, manualInstructions, timezone, loginHref,
  lockedEmail = null, inviteToken = null,
}: Props) {
  const [stage, setStage] = useState<Stage>('choice')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Details
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(lockedEmail ?? '')
  const [phone, setPhone] = useState('')
  const [sessionId, setSessionId] = useState(preselectedSessionId ?? (sessions[0]?.id ?? ''))
  const [agree, setAgree] = useState(false)

  // Discount code (online-paid drop-ins)
  const [discountInput, setDiscountInput] = useState('')
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{ id: string; code: string; type: 'percent' | 'fixed'; value: number } | null>(null)

  const discountAmountCents = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round(priceCents * appliedDiscount.value / 100)
      : Math.min(appliedDiscount.value * 100, priceCents)
    : 0
  const discountedPriceCents = Math.max(0, priceCents - discountAmountCents)

  async function applyDiscount() {
    const code = discountInput.trim()
    if (!code) return
    setDiscountLoading(true); setDiscountError(null)
    const result = await validateDiscountCode(code, org.id, 'dropins', league.id)
    setDiscountLoading(false)
    if (result.valid && result.discount) setAppliedDiscount(result.discount)
    else setDiscountError(result.error ?? 'Invalid code')
  }

  // Waiver
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState<'adult' | 'minor' | null>(null)
  const [signatureName, setSignatureName] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship>('parent')

  const isMinor = ageConfirmed === 'minor'
  const showAgeGate = stage === 'waiver' && !!waiver && ageConfirmed === null

  useEffect(() => {
    if (!sentinelRef.current || stage !== 'waiver' || showAgeGate) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setScrolledToBottom(true) },
      { threshold: 0.5 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [stage, showAgeGate, ageConfirmed])

  const priceLabel = priceCents > 0
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: (currency || 'cad').toUpperCase() }).format(priceCents / 100)
    : null
  // There's a fee but no online payment available — the player pays in person.
  const payInPerson = priceCents > 0 && !onlinePayments

  function sessionLabel(s: SessionOption) {
    const dt = new Date(s.scheduled_at).toLocaleString('en-CA', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
    })
    const full = s.capacity != null && s.registered_count >= s.capacity
    return `${dt}${full ? ' (full)' : ''}`
  }

  // Run the registration (after waiver, or directly if no waiver).
  async function submit(waiverSignatureId: string | null) {
    setLoading(true); setError(null)
    const result = await registerGuestDropin({
      leagueId: league.id,
      sessionId: sessionId || null,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || '',
      waiverSignatureId: waiverSignatureId || null,
      inviteToken: inviteToken || undefined,
    })
    if (result.error || !result.registrationId) {
      setError(result.error ?? 'Could not complete registration.')
      setLoading(false)
      setStage('details')
      return
    }

    if (result.needsPayment) {
      // Hand off to the public guest checkout, then Stripe.
      try {
        const res = await fetch('/api/stripe/guest-dropin-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: result.registrationId, discountId: appliedDiscount?.id }),
        })
        const body = await res.json()
        if (!res.ok || !body.url) {
          setError(body.error ?? 'Could not start checkout.')
          setLoading(false); setStage('details'); return
        }
        window.location.href = body.url
      } catch {
        setError('Could not start checkout. Please try again.')
        setLoading(false); setStage('details')
      }
      return
    }

    // Free or pay-at-the-door — straight to the guest confirmation.
    window.location.href = `/register/${league.slug}/guest-success?reg=${result.registrationId}`
  }

  function continueFromDetails() {
    setError(null)
    if (fullName.trim().length < 2) { setError('Please enter your name.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email.'); return }
    if (!agree) { setError('Please accept the terms to continue.'); return }
    if (waiver) { setStage('waiver') } else { setStage('submitting'); submit(null) }
  }

  async function signAndSubmit() {
    if (!waiver) return
    const signer = isMinor ? guardianName.trim() : signatureName.trim()
    if (!signer) { setError(isMinor ? "Enter the guardian's full legal name." : 'Type your full name to sign.'); return }
    setLoading(true); setError(null)
    const sig = await signWaiverAsGuest({
      waiverId: waiver.id,
      leagueId: league.id,
      leagueName: league.name,
      orgId: org.id,
      guestName: fullName.trim(),
      guestEmail: email.trim(),
      signatureName: signer,
      guardianRelationship: isMinor ? guardianRelationship : undefined,
    })
    if (sig.error || !sig.data?.signatureId) {
      setError(sig.error ?? 'Waiver signing failed.')
      setLoading(false)
      return
    }
    setStage('submitting')
    await submit(sig.data.signatureId)
  }

  const errorBox = error && (
    <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
  )

  // ── Choice ─────────────────────────────────────────────────────────────────
  if (stage === 'choice') {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Join</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {league.name}
          </h1>
          {priceLabel && <p className="text-lg font-semibold mt-1" style={{ color: 'var(--brand-primary)' }}>{priceLabel} drop-in</p>}
          {payInPerson && <p className="text-xs text-gray-500 mt-1">💵 Paid in person at the venue</p>}
        </div>

        <a
          href={loginHref}
          className="flex items-center gap-3 w-full rounded-xl border bg-white px-4 py-4 hover:shadow-sm transition-shadow text-left"
        >
          <LogIn className="w-5 h-5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
          <span>
            <span className="block font-semibold text-gray-900">Sign in or create an account</span>
            <span className="block text-sm text-gray-500">Track your events, receive event alerts, and keep your waivers and receipts.</span>
          </span>
        </a>

        <button
          type="button"
          onClick={() => setStage('details')}
          className="flex items-center gap-3 w-full rounded-xl border bg-white px-4 py-4 hover:shadow-sm transition-shadow text-left"
        >
          <UserPlus className="w-5 h-5 shrink-0 text-gray-500" />
          <span>
            <span className="block font-semibold text-gray-900">Continue as a guest</span>
            <span className="block text-sm text-gray-500">Just your name and email — no account needed.</span>
          </span>
        </button>
      </div>
    )
  }

  // ── Details ────────────────────────────────────────────────────────────────
  if (stage === 'details') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setStage('choice'); setError(null) }} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--brand-heading-font)' }}>Your details</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registering for {league.name}{priceLabel ? ` · ${priceLabel}` : ''}</p>
        </div>

        {payInPerson && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
            💵 <strong>Pay {priceLabel} in person</strong> at the venue — there&apos;s no online payment for this event.
            {manualInstructions && <span className="block text-amber-700 mt-1 whitespace-pre-wrap">{manualInstructions}</span>}
          </div>
        )}

        {errorBox}

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" placeholder="Jordan Smith" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!lockedEmail}
              className={`mt-1 w-full border rounded-md px-3 py-2 text-sm ${lockedEmail ? 'bg-gray-50 text-gray-500' : ''}`} placeholder="you@example.com" />
            <span className="block text-xs font-normal text-gray-400 mt-1">
              {lockedEmail ? 'This event is invite-only — registering with your invited email.' : 'For your receipt and check-in details.'}
            </span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Phone <span className="font-normal text-gray-400">(optional)</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" placeholder="(555) 123-4567" />
          </label>

          {sessions.length > 0 && (
            <label className="block text-sm font-medium text-gray-700">
              Session
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white">
                {sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
              </select>
            </label>
          )}

          {/* Discount code — only meaningful for online-paid drop-ins */}
          {priceCents > 0 && onlinePayments && (
            appliedDiscount ? (
              <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
                <span className="text-green-700 font-medium">
                  {appliedDiscount.code} applied — {discountedPriceCents > 0
                    ? `now ${new Intl.NumberFormat('en-CA', { style: 'currency', currency: (currency || 'cad').toUpperCase() }).format(discountedPriceCents / 100)}`
                    : 'free'}
                </span>
                <button type="button" onClick={() => { setAppliedDiscount(null); setDiscountInput('') }} className="text-green-700 hover:underline text-xs">Remove</button>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Discount code <span className="font-normal text-gray-400">(optional)</span></label>
                <div className="flex gap-2">
                  <input
                    value={discountInput}
                    onChange={(e) => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyDiscount() } }}
                    placeholder="CODE"
                    className="flex-1 border rounded-md px-3 py-2 text-sm font-mono uppercase tracking-wide"
                  />
                  <button type="button" onClick={applyDiscount} disabled={discountLoading || !discountInput.trim()}
                    className="px-3 py-2 rounded-md border text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {discountLoading ? '…' : 'Apply'}
                  </button>
                </div>
                {discountError && <p className="text-xs text-red-600 mt-1">{discountError}</p>}
              </div>
            )
          )}

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[var(--brand-primary)]" />
            <span className="text-sm text-gray-600">I agree to the organizer&apos;s terms and to being contacted about this event.</span>
          </label>
        </div>

        <button
          type="button"
          onClick={continueFromDetails}
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Please wait…' : waiver ? 'Continue to waiver' : priceCents > 0 && onlinePayments ? 'Continue to payment' : 'Complete registration'}
        </button>
      </div>
    )
  }

  // ── Submitting (redirecting) ────────────────────────────────────────────────
  if (stage === 'submitting') {
    return (
      <div className="py-12 text-center text-gray-500">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-3" />
        <p className="text-sm">{priceCents > 0 && onlinePayments ? 'Taking you to secure checkout…' : 'Finishing up…'}</p>
        {errorBox}
      </div>
    )
  }

  // ── Waiver: age gate ────────────────────────────────────────────────────────
  if (showAgeGate && waiver) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">{waiver.title}</h2>
          <p className="text-sm text-gray-500 mt-1">Before signing, please confirm your age.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Are you 18 years of age or older?</legend>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="radio" name="age_confirm" value="adult" onChange={() => setAgeConfirmed('adult')} className="accent-[var(--brand-primary)]" />
            <span className="text-sm font-medium">Yes, I am 18 or older</span>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="radio" name="age_confirm" value="minor" onChange={() => setAgeConfirmed('minor')} className="accent-[var(--brand-primary)]" />
            <span className="text-sm font-medium">No, I am under 18</span>
          </label>
        </fieldset>
      </div>
    )
  }

  // ── Waiver: content + sign ──────────────────────────────────────────────────
  if (stage === 'waiver' && waiver) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">{waiver.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">Please read and sign to continue.</p>
        </div>

        {isMinor && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A parent or legal guardian must read and sign on the participant&apos;s behalf.
          </div>
        )}

        <div className="border rounded-lg p-4 max-h-72 overflow-y-auto bg-white text-sm text-gray-700">
          <RichTextContent content={waiver.content} className="text-gray-700" />
          <div ref={sentinelRef} className="h-1" />
        </div>
        {!scrolledToBottom && <p className="text-xs text-gray-400 text-center">Scroll to the bottom to continue.</p>}

        {errorBox}

        {isMinor ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Guardian&apos;s full legal name
              <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" placeholder="Full name" />
            </label>
            <fieldset className="flex gap-2">
              {(['parent', 'legal_guardian'] as GuardianRelationship[]).map((rel) => (
                <label key={rel} className={`flex-1 text-center text-sm px-3 py-2 rounded-md border cursor-pointer ${guardianRelationship === rel ? 'border-[var(--brand-primary)] bg-gray-50 font-medium' : ''}`}>
                  <input type="radio" name="rel" className="sr-only" checked={guardianRelationship === rel} onChange={() => setGuardianRelationship(rel)} />
                  {rel === 'parent' ? 'Parent' : 'Legal guardian'}
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <label className="block text-sm font-medium text-gray-700">
            Type your full name to sign
            <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" placeholder="Your full name" />
          </label>
        )}

        <button
          type="button"
          onClick={signAndSubmit}
          disabled={loading || !scrolledToBottom}
          className="w-full px-4 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Please wait…' : priceCents > 0 && onlinePayments ? 'Agree & continue to payment' : 'Agree & complete registration'}
        </button>
        {priceCents > 0 && !onlinePayments && manualInstructions && (
          <p className="text-xs text-gray-500">Payment: {manualInstructions}</p>
        )}
      </div>
    )
  }

  return null
}
