'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { checkInByToken } from '@/actions/checkin'
import type { CheckInResult } from '@/actions/checkin'
import { unlockAudio, playCheckinSound } from '@/lib/audio'

interface Props {
  leagueId: string
  timezone: string
  checkinSound?: string | null
}

type ScanState =
  | { type: 'idle' }
  | { type: 'scanning' }
  | { type: 'success'; playerName: string; teamName: string | null }
  | { type: 'already_in'; playerName: string; checkedInAt: string }
  | { type: 'error'; message: string }

function resultFromAction(r: CheckInResult): ScanState {
  if (r.status === 'success') return { type: 'success', playerName: r.playerName, teamName: r.teamName }
  if (r.status === 'already_checked_in') return { type: 'already_in', playerName: r.playerName, checkedInAt: r.checkedInAt }
  if (r.status === 'wrong_event') return { type: 'error', message: 'This QR is for a different event.' }
  if (r.status === 'unauthorized') return { type: 'error', message: 'You must be logged in to check in players.' }
  return { type: 'error', message: 'QR code not recognised.' }
}

function extractToken(raw: string): string | null {
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const match = raw.match(uuidRe)
  return match ? match[0] : null
}

export function QRScanner({ leagueId, timezone, checkinSound }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTokenRef = useRef<string | null>(null)
  const cooldownRef = useRef(false)
  const [isActive, setIsActive] = useState(false)
  const [scanState, setScanState] = useState<ScanState>({ type: 'idle' })
  const [isPending, startTransition] = useTransition()
  const [cameraError, setCameraError] = useState<string | null>(null)

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
              const result = await checkInByToken(token, leagueId)
              const nextState = resultFromAction(result)
              setScanState(nextState)
              if (nextState.type === 'success') playCheckinSound(checkinSound)
              setTimeout(() => {
                lastTokenRef.current = null
                cooldownRef.current = false
                setScanState({ type: 'idle' })
              }, 3000)
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
  }, [isActive, leagueId])

  function handleStop() {
    setIsActive(false)
    setScanState({ type: 'idle' })
    lastTokenRef.current = null
    cooldownRef.current = false
  }

  return (
    <div className="space-y-3">
      {/* Toggle button */}
      {!isActive ? (
        <button
          onClick={() => { unlockAudio(); setCameraError(null); setIsActive(true) }}
          className="flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {/* Camera icon */}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Start Scanning
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Stop Scanning
        </button>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-sm font-medium text-red-700">{cameraError}</p>
        </div>
      )}

      {/* Viewfinder — always in DOM when active so html5-qrcode can mount into it */}
      {isActive && (
        <div className="space-y-3">
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ maxWidth: 360 }}>
            <div id="qr-scanner-region" ref={containerRef} style={{ width: '100%' }} />
            {/* Corner overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-56 h-56">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-sm" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-sm" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-sm" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-sm" />
              </div>
            </div>
          </div>

          {/* Result feedback */}
          <div className="min-h-[80px] flex items-center justify-center">
            {(isPending || scanState.type === 'scanning') && (
              <div className="text-center text-gray-500 text-sm animate-pulse">Checking in…</div>
            )}

            {scanState.type === 'success' && (
              <div className="w-full bg-green-50 border border-green-200 rounded-lg px-5 py-4 text-center">
                <p className="text-2xl mb-1">✓</p>
                <p className="font-semibold text-green-800">{scanState.playerName}</p>
                {scanState.teamName && <p className="text-sm text-green-600">{scanState.teamName}</p>}
                <p className="text-xs text-green-600 mt-1">Checked in</p>
              </div>
            )}

            {scanState.type === 'already_in' && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-center">
                <p className="text-2xl mb-1">⚠</p>
                <p className="font-semibold text-amber-800">{scanState.playerName}</p>
                <p className="text-xs text-amber-600 mt-1">
                  Already checked in at {new Date(scanState.checkedInAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                </p>
              </div>
            )}

            {scanState.type === 'error' && (
              <div className="w-full bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-center">
                <p className="text-2xl mb-1">✗</p>
                <p className="text-sm text-red-700">{scanState.message}</p>
              </div>
            )}

            {scanState.type === 'idle' && (
              <p className="text-sm text-gray-400 text-center">Point the camera at a player&apos;s QR code</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
