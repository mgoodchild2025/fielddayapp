'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { signWaiver } from '@/actions/waivers'
import { confirmGameSub, declineGameSub } from '@/actions/game-subs'
import { RichTextContent } from '@/components/ui/rich-text-content'
import type { GameSubInviteDetails } from '@/actions/game-subs'

type GuardianRelationship = 'parent' | 'legal_guardian'

interface Props {
  token: string
  invite: GameSubInviteDetails
  gameDate: string
  gameTime: string
  /** Waiver details — null if no waiver required for this org */
  waiver: { id: string; title: string; content: string } | null
  /** Whether the user already has a valid waiver signature for this org */
  hasExistingWaiver: boolean
}

type Stage = 'ready' | 'waiver' | 'confirmed' | 'declined' | 'error'

export function GameSubClient({ token, invite, gameDate, gameTime, waiver, hasExistingWaiver }: Props) {
  const initialStage: Stage =
    invite.status === 'confirmed' ? 'confirmed'
    : invite.status === 'declined' ? 'declined'
    : (!hasExistingWaiver && waiver) ? 'waiver'
    : 'ready'

  const [stage, setStage] = useState<Stage>(initialStage)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Waiver signing state ─────────────────────────────────────────────────
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [ageConfirmed, setAgeConfirmed] = useState<'adult' | 'minor' | null>(null)
  const [signatureName, setSignatureName] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship>('parent')

  const showAgeGate = waiver && stage === 'waiver' && ageConfirmed === null
  const isMinor = ageConfirmed === 'minor' ? true : ageConfirmed === 'adult' ? false : null

  useEffect(() => {
    if (!sentinelRef.current || stage !== 'waiver') return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setScrolledToBottom(true) },
      { threshold: 0.5 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [stage, ageConfirmed])

  const gameColor = invite.teamColor ?? '#6b7280'

  // ── Shared game detail card ───────────────────────────────────────────────
  const gameCard = (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: gameColor }} />
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          {invite.teamLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={invite.teamLogoUrl} alt={invite.teamName}
              className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
              style={{ backgroundColor: gameColor }}>
              {invite.teamName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sub Invite</p>
            <p className="font-bold text-gray-900 leading-tight">
              {invite.teamName}
              {invite.opponentName && <span className="font-normal text-gray-500"> vs {invite.opponentName}</span>}
            </p>
          </div>
        </div>
        <div className="space-y-0.5 text-sm text-gray-500">
          <p>{gameDate} · {gameTime}{invite.court ? ` · ${invite.court}` : ''}</p>
          {invite.leagueName && <p className="text-xs text-gray-400">{invite.leagueName}</p>}
        </div>
        {invite.message && (
          <p className="mt-3 text-sm text-gray-600 italic border-l-2 border-gray-200 pl-3">
            &ldquo;{invite.message}&rdquo;
            {invite.inviterName && <span className="not-italic text-gray-400"> — {invite.inviterName}</span>}
          </p>
        )}
      </div>
    </div>
  )

  // ── Handle confirm (no waiver needed) ────────────────────────────────────
  async function handleConfirm() {
    setLoading(true)
    setErrorMsg(null)
    const result = await confirmGameSub(token)
    if (result.error) { setErrorMsg(result.error); setLoading(false); return }
    setStage('confirmed')
    setLoading(false)
  }

  // ── Handle decline ────────────────────────────────────────────────────────
  async function handleDecline() {
    setLoading(true)
    setErrorMsg(null)
    const result = await declineGameSub(token)
    if (result.error) { setErrorMsg(result.error); setLoading(false); return }
    setStage('declined')
    setLoading(false)
  }

  // ── Handle waiver sign + confirm ─────────────────────────────────────────
  async function handleWaiverSign() {
    if (!waiver) return
    setLoading(true)
    setErrorMsg(null)

    const signer = isMinor ? guardianName.trim() : signatureName.trim()
    if (!signer) {
      setErrorMsg(isMinor ? 'Enter the guardian\'s full legal name' : 'Type your full name to sign')
      setLoading(false)
      return
    }

    const sigResult = await signWaiver({
      waiverId: waiver.id,
      signatureName: signer,
      leagueId: invite.leagueId ?? undefined,
      leagueName: invite.leagueName ?? undefined,
      guardianRelationship: isMinor ? guardianRelationship : undefined,
    })
    if (sigResult.error || !sigResult.data?.signatureId) {
      setErrorMsg(sigResult.error ?? 'Waiver signing failed')
      setLoading(false)
      return
    }

    const confirmResult = await confirmGameSub(token, sigResult.data.signatureId)
    if (confirmResult.error) { setErrorMsg(confirmResult.error); setLoading(false); return }
    setStage('confirmed')
    setLoading(false)
  }

  // ── Confirmed state ───────────────────────────────────────────────────────
  if (stage === 'confirmed') {
    return (
      <div className="space-y-4">
        {gameCard}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
          <div className="text-4xl">✅</div>
          <p className="font-bold text-green-800 text-lg">You&apos;re confirmed!</p>
          <p className="text-sm text-green-700">This game has been added to your schedule.</p>
          <Link
            href={`/games/${invite.gameId}`}
            className="inline-block mt-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            View Game Details →
          </Link>
        </div>
      </div>
    )
  }

  // ── Declined state ────────────────────────────────────────────────────────
  if (stage === 'declined') {
    return (
      <div className="space-y-4">
        {gameCard}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center space-y-2">
          <p className="font-semibold text-gray-700">You&apos;ve declined this invite.</p>
          <p className="text-sm text-gray-400">The captain has been notified.</p>
        </div>
      </div>
    )
  }

  // ── Age gate (shown before waiver content) ────────────────────────────────
  if (showAgeGate) {
    return (
      <div className="space-y-4">
        {gameCard}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold">{waiver!.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Before signing, please confirm your age.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">Are you 18 years of age or older?</legend>
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="age_confirm" value="adult"
                onChange={() => setAgeConfirmed('adult')} className="accent-[var(--brand-primary)]" />
              <span className="text-sm font-medium">Yes, I am 18 or older</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="age_confirm" value="minor"
                onChange={() => setAgeConfirmed('minor')} className="accent-[var(--brand-primary)]" />
              <span className="text-sm font-medium">No, I am under 18</span>
            </label>
          </fieldset>
        </div>
      </div>
    )
  }

  // ── Waiver stage ──────────────────────────────────────────────────────────
  if (stage === 'waiver' && waiver) {
    const minorBanner = isMinor ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
        <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Parent or guardian signature required</p>
          <p className="mt-0.5 text-amber-700">You are under 18. A parent or legal guardian must sign on your behalf.</p>
        </div>
      </div>
    ) : null

    return (
      <div className="space-y-4">
        {gameCard}
        {minorBanner}

        {/* Waiver content */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-3">{waiver.title}</h2>
          <div className="relative">
            <div className="h-64 overflow-y-auto border rounded-md p-4 text-gray-700 text-sm">
              <RichTextContent content={waiver.content} />
              <div ref={sentinelRef} className="h-1" />
            </div>
            {!scrolledToBottom && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none rounded-b-md overflow-hidden">
                <div className="h-12 bg-gradient-to-t from-white to-transparent" />
                <div className="bg-white pb-2 flex flex-col items-center gap-0.5">
                  <svg className="w-4 h-4 text-gray-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-xs font-medium text-gray-500">Scroll to sign</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Signature block */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{isMinor ? 'Guardian Signature' : 'Sign Below'}</h2>
          {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{errorMsg}</div>}

          {isMinor ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guardian&apos;s full legal name</label>
                <input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)}
                  disabled={!scrolledToBottom}
                  placeholder={scrolledToBottom ? 'e.g. Jane Smith' : 'Scroll to enable'}
                  className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                <select value={guardianRelationship} onChange={e => setGuardianRelationship(e.target.value as GuardianRelationship)}
                  disabled={!scrolledToBottom} className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50">
                  <option value="parent">Parent</option>
                  <option value="legal_guardian">Legal Guardian</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type your full legal name</label>
              <input type="text" value={signatureName} onChange={e => setSignatureName(e.target.value)}
                disabled={!scrolledToBottom}
                placeholder={scrolledToBottom ? 'Your full name' : 'Scroll to enable'}
                className="w-full border rounded-md px-3 py-2 text-base disabled:bg-gray-50 disabled:text-gray-400" />
            </div>
          )}

          <button
            onClick={handleWaiverSign}
            disabled={!scrolledToBottom || !(isMinor ? guardianName.trim() : signatureName.trim()) || loading}
            className="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Confirming…' : 'Sign & Confirm as Sub →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Ready to confirm (waiver already signed) ──────────────────────────────
  return (
    <div className="space-y-4">
      {gameCard}
      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{errorMsg}</div>}
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <p className="text-sm text-gray-600">Are you available to sub for this game?</p>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Confirming…' : "I'm In →"}
        </button>
        <button
          onClick={handleDecline}
          disabled={loading}
          className="w-full py-2.5 rounded-lg font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          I Can&apos;t Make It
        </button>
      </div>
    </div>
  )
}
