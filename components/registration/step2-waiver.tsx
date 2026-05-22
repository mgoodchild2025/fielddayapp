'use client'

import { useState, useRef, useEffect } from 'react'
import { signWaiver } from '@/actions/waivers'
import type { Database } from '@/types/database'
import { RichTextContent } from '@/components/ui/rich-text-content'

type Waiver = Database['public']['Tables']['waivers']['Row']
type GuardianRelationship = 'parent' | 'legal_guardian'

interface Props {
  org: { id: string }
  waiver: Waiver | null
  userId: string
  leagueId?: string
  leagueName?: string
  registrationId?: string | null
  playerName: string
  onComplete: (signatureId: string) => void
  onSkip: () => void
  onBack?: () => void
}

export function Step2Waiver({ org, waiver, userId, leagueId, leagueName, registrationId, playerName, onComplete, onSkip, onBack }: Props) {
  // Age is always self-declared — no birthdate is stored
  const [ageConfirmed, setAgeConfirmed] = useState<'adult' | 'minor' | null>(null)

  const isMinor = ageConfirmed === 'minor' ? true : ageConfirmed === 'adult' ? false : null
  const showAgeGate = ageConfirmed === null

  // Waiver scroll state
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Standard signing
  const [signatureName, setSignatureName] = useState('')

  // Guardian signing
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship>('parent')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setScrolledToBottom(true) },
      { threshold: 0.5 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [showAgeGate])

  if (!waiver) {
    return (
      <div className="bg-white rounded-lg border p-6 text-center space-y-4">
        <p className="text-gray-500">No waiver required for this league.</p>
        <div className="flex gap-3 justify-center">
          {onBack && (
            <button onClick={onBack} className="px-5 py-2.5 rounded-md font-semibold border text-gray-600 hover:bg-gray-50 transition-colors">
              ← Back
            </button>
          )}
          <button onClick={onSkip} className="px-6 py-2.5 rounded-md font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
            Continue →
          </button>
        </div>
      </div>
    )
  }

  async function handleSign() {
    setError(null)
    const signer = isMinor ? guardianName.trim() : signatureName.trim()
    if (!signer) {
      setError(isMinor ? 'Please enter the guardian\'s full legal name' : 'Please type your full name to sign')
      return
    }
    setLoading(true)
    const result = await signWaiver({
      waiverId: waiver!.id,
      signatureName: signer,
      leagueId,
      leagueName,
      registrationId: registrationId ?? undefined,
      guardianRelationship: isMinor ? guardianRelationship : undefined,
    })
    if (result.error) { setError(result.error); setLoading(false); return }
    // Dismiss keyboard and reset scroll before the step transition
    ;(document.activeElement as HTMLElement)?.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
    onComplete(result.data!.signatureId)
  }

  // ── Age gate (shown only when DOB is unknown) ────────────────────────────────
  if (showAgeGate) {
    return (
      <div className="bg-white rounded-lg border p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-base">{waiver.title}</h2>
          <p className="text-sm text-gray-500 mt-1">Before we show you the waiver, we need to confirm your age.</p>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-gray-700">Are you 18 years of age or older?</legend>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="age_confirm"
              value="adult"
              onChange={() => setAgeConfirmed('adult')}
              className="accent-[var(--brand-primary)]"
            />
            <span className="text-sm font-medium">Yes, I am 18 or older</span>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="age_confirm"
              value="minor"
              onChange={() => setAgeConfirmed('minor')}
              className="accent-[var(--brand-primary)]"
            />
            <span className="text-sm font-medium">No, I am under 18</span>
          </label>
        </fieldset>
      </div>
    )
  }

  // ── Minor notice banner ──────────────────────────────────────────────────────
  const minorBanner = isMinor ? (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
      <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
      <div className="text-sm text-amber-800">
        <p className="font-semibold">Parent or guardian signature required</p>
        <p className="mt-0.5 text-amber-700">
          {playerName ? `${playerName} is` : 'This player is'} under 18. A parent or legal guardian must read and sign this waiver on their behalf.
        </p>
      </div>
    </div>
  ) : null

  // ── Signing block ────────────────────────────────────────────────────────────
  const signingBlock = isMinor ? (
    <div className="bg-white rounded-lg border p-5 space-y-4">
      <h2 className="font-semibold">Guardian Signature</h2>
      <p className="text-sm text-gray-500">
        By signing below, you confirm you are the parent or legal guardian of{' '}
        <strong>{playerName || 'this player'}</strong> and that you have read and agree to the waiver above.
      </p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Guardian&apos;s full legal name
          </label>
          <input
            type="text"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            disabled={!scrolledToBottom}
            placeholder={scrolledToBottom ? 'e.g. Jane Smith' : 'Scroll to the bottom to enable signing'}
            className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to player</label>
          <select
            value={guardianRelationship}
            onChange={(e) => setGuardianRelationship(e.target.value as GuardianRelationship)}
            disabled={!scrolledToBottom}
            className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="parent">Parent</option>
            <option value="legal_guardian">Legal Guardian</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSign}
        disabled={!scrolledToBottom || !guardianName.trim() || loading}
        className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Signing…' : 'I Agree & Sign as Guardian →'}
      </button>
    </div>
  ) : (
    <div className="bg-white rounded-lg border p-5 space-y-3">
      <h2 className="font-semibold">Sign Below</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type your full legal name</label>
        <input
          type="text"
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
          disabled={!scrolledToBottom}
          placeholder={scrolledToBottom ? 'Your full name' : 'Scroll to the bottom to enable signing'}
          className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50 disabled:text-gray-400"
        />
      </div>
      <button
        onClick={handleSign}
        disabled={!scrolledToBottom || !signatureName.trim() || loading}
        className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Signing…' : 'I Agree & Sign →'}
      </button>
    </div>
  )

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

      {minorBanner}

      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-semibold">{waiver.title}</h2>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(waiver as any).pdf_url && (
            <a
              href={(waiver as any).pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              View PDF
            </a>
          )}
        </div>
        <div className="relative mt-3">
          <div className="h-72 overflow-y-auto border rounded-md p-4 text-gray-700">
            <RichTextContent content={waiver.content} />
            <div ref={sentinelRef} className="h-1" />
          </div>
          {/* Scroll-to-bottom prompt — hidden once the sentinel is visible */}
          {!scrolledToBottom && (
            <div className="absolute bottom-0 left-0 right-0 pointer-events-none rounded-b-md overflow-hidden">
              {/* gradient fade */}
              <div className="h-16 bg-gradient-to-t from-white to-transparent" />
              {/* label */}
              <div className="bg-white pb-2 flex flex-col items-center gap-0.5">
                <svg
                  className="w-4 h-4 text-gray-400 animate-bounce"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-xs font-medium text-gray-500">Scroll to the bottom to sign</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {signingBlock}
    </div>
  )
}
