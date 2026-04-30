'use client'

import { useState, useRef, useEffect } from 'react'
import { signWaiver } from '@/actions/waivers'
import type { Database } from '@/types/database'

type Waiver = Database['public']['Tables']['waivers']['Row']
type GuardianRelationship = 'parent' | 'legal_guardian'

interface Props {
  org: { id: string }
  waiver: Waiver | null
  userId: string
  leagueId?: string
  playerName: string
  playerDob: string | null   // ISO date from player_details.date_of_birth
  onComplete: (signatureId: string) => void
  onSkip: () => void
}

function calculateAge(dob: string): number {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function Step2Waiver({ org, waiver, userId, leagueId, playerName, playerDob, onComplete, onSkip }: Props) {
  // Derive minor status from DOB when available; null = unknown
  const knownMinor: boolean | null = playerDob !== null ? calculateAge(playerDob) < 18 : null

  // Age gate state — only used when DOB is unknown
  const [ageConfirmed, setAgeConfirmed] = useState<'adult' | 'minor' | null>(null)

  const isMinor = knownMinor !== null ? knownMinor : (ageConfirmed === 'minor' ? true : ageConfirmed === 'adult' ? false : null)
  const showAgeGate = knownMinor === null && ageConfirmed === null

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
  }, [])

  if (!waiver) {
    return (
      <div className="bg-white rounded-lg border p-6 text-center">
        <p className="text-gray-500 mb-4">No waiver required for this league.</p>
        <button onClick={onSkip} className="px-6 py-2.5 rounded-md font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          Continue →
        </button>
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
      guardianRelationship: isMinor ? guardianRelationship : undefined,
    })
    if (result.error) { setError(result.error); setLoading(false); return }
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
            className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to player</label>
          <select
            value={guardianRelationship}
            onChange={(e) => setGuardianRelationship(e.target.value as GuardianRelationship)}
            disabled={!scrolledToBottom}
            className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
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
          className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
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
      {minorBanner}

      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{waiver.title}</h2>
        <p className="text-xs text-gray-400 mb-3">Scroll to the bottom to sign</p>
        <div className="h-72 overflow-y-auto border rounded-md p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {waiver.content}
          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>

      {signingBlock}
    </div>
  )
}
