'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { checkInByToken } from '@/actions/checkin'
import type { CheckInResult } from '@/actions/checkin'

interface Props {
  leagueId: string
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
  // Handle both full URLs (/checkin/[token]) and bare UUIDs
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const match = raw.match(uuidRe)
  return match ? match[0] : null
}

export function QRScanner({ leagueId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<unknown>(null)
  const lastTokenRef = useRef<string | null>(null)
  const cooldownRef = useRef(false)
  const [scanState, setScanState] = useState<ScanState>({ type: 'idle' })
  const [isPending, startTransition] = useTransition()
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5QrCode: any = null

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scannerId = 'qr-scanner-region'
        html5QrCode = new Html5Qrcode(scannerId)
        scannerRef.current = html5QrCode

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
              setScanState(resultFromAction(result))
              // Resume scanning after 3s
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
      }
    }

    startScanner()

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (html5QrCode) {
        html5QrCode.stop().catch(() => undefined)
      }
    }
  }, [leagueId])

  if (cameraError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-sm font-medium text-red-700">{cameraError}</p>
        <button
          onClick={() => { setCameraError(null); window.location.reload() }}
          className="mt-3 text-sm text-red-600 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Camera viewfinder */}
      <div className="relative bg-black rounded-xl overflow-hidden" style={{ maxWidth: 360, margin: '0 auto' }}>
        <div id="qr-scanner-region" ref={containerRef} style={{ width: '100%' }} />
        {/* Overlay corners */}
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
              Already checked in at {new Date(scanState.checkedInAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
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
  )
}
