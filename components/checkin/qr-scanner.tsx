'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { checkInByToken, checkInWalkIn } from '@/actions/checkin'
import type { CheckInResult } from '@/actions/checkin'
import { unlockAudio, playCheckinSound } from '@/lib/audio'
import { TeamCheckinModal } from '@/components/checkin/team-checkin-modal'

interface Props {
  leagueId: string
  timezone: string
  checkinSound?: string | null
  sessionId?: string   // if provided, do per-session check-in
}

type ScanState =
  | { type: 'idle' }
  | { type: 'scanning' }
  | { type: 'success'; playerName: string; teamName: string | null; teamId: string | null }
  | { type: 'already_in'; playerName: string; checkedInAt: string }
  | { type: 'not_in_session'; playerName: string; registrationId: string }
  | { type: 'walk_in_success'; playerName: string }
  | { type: 'error'; message: string }

function resultFromAction(r: CheckInResult): ScanState {
  if (r.status === 'success') return { type: 'success', playerName: r.playerName, teamName: r.teamName, teamId: r.teamId }
  if (r.status === 'already_checked_in') return { type: 'already_in', playerName: r.playerName, checkedInAt: r.checkedInAt }
  if (r.status === 'not_registered_for_session') return { type: 'not_in_session', playerName: r.playerName, registrationId: r.registrationId }
  if (r.status === 'wrong_event') return { type: 'error', message: 'This QR is for a different event.' }
  if (r.status === 'unauthorized') return { type: 'error', message: 'You must be logged in to check in players.' }
  return { type: 'error', message: 'QR code not recognised.' }
}

function extractToken(raw: string): string | null {
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const match = raw.match(uuidRe)
  return match ? match[0] : null
}

export function QRScanner({ leagueId, timezone, checkinSound, sessionId }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTokenRef = useRef<string | null>(null)
  const cooldownRef = useRef(false)
  const [isActive, setIsActive] = useState(false)
  const [scanState, setScanState] = useState<ScanState>({ type: 'idle' })
  const [isPending, startTransition] = useTransition()
  const [isWalkInPending, startWalkInTransition] = useTransition()
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [teamModalId, setTeamModalId] = useState<string | null>(null)

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isActive])

  useEffect(() => {
    if (!isActive) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5QrCode: any = null

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        html5QrCode = new Html5Qrcode('qr-scanner-region')

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            if (cooldownRef.current) return
            const token = extractToken(decodedText)
            if (!token || token === lastTokenRef.current) return

            lastTokenRef.current = token
            cooldownRef.current = true
            setScanState({ type: 'scanning' })

            startTransition(async () => {
              const result = await checkInByToken(token, leagueId, sessionId)
              const nextState = resultFromAction(result)
              setScanState(nextState)

              if (nextState.type === 'success') {
                playCheckinSound(checkinSound)
                router.refresh()
                setTimeout(() => {
                  lastTokenRef.current = null
                  cooldownRef.current = false
                  setScanState({ type: 'idle' })
                }, 3000)
              } else if (nextState.type === 'not_in_session') {
                // Keep state visible so admin can choose; unblock scanner for other players after 8s
                setTimeout(() => {
                  lastTokenRef.current = null
                  cooldownRef.current = false
                }, 8000)
              } else {
                setTimeout(() => {
                  lastTokenRef.current = null
                  cooldownRef.current = false
                  setScanState({ type: 'idle' })
                }, 3000)
              }
            })
          },
          () => { /* ignore per-frame decode errors */ },
        )

        setScanState({ type: 'idle' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setCameraError(
          msg.toLowerCase().includes('permission')
            ? 'Camera permission denied. Please allow camera access and reload.'
            : 'Could not start camera. Please check your device and browser permissions.',
        )
        setIsActive(false)
      }
    }

    startScanner()

    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(() => undefined)
      }
    }
  }, [isActive, leagueId, sessionId])

  function handleClose() {
    setIsActive(false)
    setScanState({ type: 'idle' })
    lastTokenRef.current = null
    cooldownRef.current = false
  }

  function handleWalkIn(registrationId: string, playerName: string) {
    if (!sessionId) return
    startWalkInTransition(async () => {
      const result = await checkInWalkIn(registrationId, sessionId, leagueId)
      if (result.error) {
        setScanState({ type: 'error', message: result.error })
      } else {
        setScanState({ type: 'walk_in_success', playerName })
        playCheckinSound(checkinSound)
        router.refresh()
      }
      setTimeout(() => {
        lastTokenRef.current = null
        cooldownRef.current = false
        setScanState({ type: 'idle' })
      }, 3000)
    })
  }

  return (
    <>
      {/* Team check-in modal — rendered outside the scanner modal so z-index stacks correctly */}
      {teamModalId && (
        <TeamCheckinModal
          teamId={teamModalId}
          leagueId={leagueId}
          timezone={timezone}
          onClose={() => setTeamModalId(null)}
        />
      )}

      {/* Start Scanning button */}
      {!isActive && (
        <div className="space-y-3">
          <button
            onClick={() => { unlockAudio(); setCameraError(null); setIsActive(true) }}
            className="flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Start Scanning
          </button>
          {cameraError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-medium text-red-700">{cameraError}</p>
            </div>
          )}
        </div>
      )}

      {/* Scanner modal */}
      {isActive && (
        <div className="fixed inset-0 z-[400] sm:flex sm:items-center sm:justify-center">
          {/* Backdrop — desktop only */}
          <div className="hidden sm:block absolute inset-0 bg-black/70" onClick={handleClose} aria-hidden="true" />

          {/* Panel — full-screen on mobile, centred card on desktop */}
          <div className="absolute inset-0 sm:relative sm:inset-auto sm:w-full sm:max-w-sm bg-black sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
              <p className="text-sm font-semibold text-white">Scan Player QR Code</p>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close scanner"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Viewfinder — fills all remaining height on mobile; square aspect ratio on desktop */}
            <div className="relative bg-black flex-1 sm:flex-none sm:aspect-square" style={{ minHeight: 0 }}>
              <div id="qr-scanner-region" ref={containerRef} style={{ width: '100%', height: '100%' }} />

              {/* Corner brackets */}
              {(scanState.type === 'idle' || scanState.type === 'scanning') && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-56 h-56">
                    <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-sm" />
                    <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-sm" />
                    <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-sm" />
                    <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-sm" />
                  </div>
                </div>
              )}

              {/* Idle hint */}
              {scanState.type === 'idle' && (
                <div className="absolute bottom-0 inset-x-0 pb-4 flex justify-center pointer-events-none">
                  <p className="text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
                    Point camera at a player&apos;s QR code
                  </p>
                </div>
              )}

              {/* Scanning */}
              {(isPending || scanState.type === 'scanning') && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <p className="text-white text-sm font-medium animate-pulse">Checking in…</p>
                </div>
              )}

              {/* Success */}
              {scanState.type === 'success' && (
                <div className="absolute inset-0 bg-green-900/95 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-5xl mb-3">✓</p>
                  <p className="font-bold text-white text-xl leading-tight">{scanState.playerName}</p>
                  {scanState.teamName && <p className="text-sm text-green-300 mt-1">{scanState.teamName}</p>}
                  <p className="text-xs text-green-400 mt-2">Checked in</p>
                  {scanState.teamId && !sessionId && (
                    <button
                      type="button"
                      onClick={() => setTeamModalId(scanState.teamId)}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-green-900 hover:bg-green-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Check In Team →
                    </button>
                  )}
                </div>
              )}

              {/* Walk-in success */}
              {scanState.type === 'walk_in_success' && (
                <div className="absolute inset-0 bg-green-900/95 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-5xl mb-3">✓</p>
                  <p className="font-bold text-white text-xl">{scanState.playerName}</p>
                  <p className="text-xs text-green-400 mt-2">Added as walk-in &amp; checked in</p>
                </div>
              )}

              {/* Not in session */}
              {scanState.type === 'not_in_session' && (
                <div className="absolute inset-0 bg-amber-900/95 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-4xl mb-3">⚠</p>
                  <p className="font-bold text-white text-lg">{scanState.playerName}</p>
                  <p className="text-xs text-amber-200 mt-1">Not registered for this session</p>
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => handleWalkIn(scanState.registrationId, scanState.playerName)}
                      disabled={isWalkInPending}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-amber-900 hover:bg-amber-50 disabled:opacity-60 transition-colors"
                    >
                      {isWalkInPending ? 'Adding…' : 'Add as Walk-in'}
                    </button>
                    <button
                      onClick={() => {
                        lastTokenRef.current = null
                        cooldownRef.current = false
                        setScanState({ type: 'idle' })
                      }}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium border border-amber-400/50 text-white hover:bg-amber-800/60 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Already checked in */}
              {scanState.type === 'already_in' && (
                <div className="absolute inset-0 bg-amber-900/95 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-4xl mb-3">⚠</p>
                  <p className="font-bold text-white text-lg">{scanState.playerName}</p>
                  <p className="text-xs text-amber-200 mt-2">
                    Already checked in at {new Date(scanState.checkedInAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                  </p>
                </div>
              )}

              {/* Error */}
              {scanState.type === 'error' && (
                <div className="absolute inset-0 bg-red-900/95 flex flex-col items-center justify-center px-6 text-center">
                  <p className="text-4xl mb-3">✗</p>
                  <p className="text-sm text-white">{scanState.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
