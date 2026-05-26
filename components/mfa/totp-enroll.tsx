'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { verifyEnrollment } from '@/actions/mfa'

type Step = 'scan' | 'confirm' | 'backup' | 'done'

interface Props {
  factorId: string
  qrCode: string      // data URI
  secret: string
  /** Navigate here after user acknowledges backup codes (full-page flow) */
  redirect?: string
  /** Called instead of router.push when embedded in another page (profile flow) */
  onComplete?: () => void
}

export function TotpEnroll({ factorId, qrCode, secret, redirect, onComplete }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('scan')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  async function handleConfirm() {
    const digits = code.replace(/\s/g, '')
    if (digits.length !== 6) return
    setLoading(true)
    setError(null)
    const result = await verifyEnrollment(factorId, digits)
    if (result.error) {
      setError(result.error)
      setCode('')
    } else if (result.backupCodes) {
      setBackupCodes(result.backupCodes)
      setStep('backup')
    }
    setLoading(false)
  }

  function downloadBackupCodes() {
    const content = [
      'Fieldday backup codes',
      '=====================',
      'Each code can only be used once.',
      'Store these somewhere safe.',
      '',
      ...backupCodes,
      '',
      `Generated: ${new Date().toLocaleDateString('en-CA', { dateStyle: 'long' })}`,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fieldday-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Step 1: Scan QR ──────────────────────────────────────────────────────
  if (step === 'scan') {
    return (
      <div>
        <ol className="text-sm text-gray-600 space-y-1 mb-5 list-decimal list-inside">
          <li>Install an authenticator app (Google Authenticator, Authy, or 1Password)</li>
          <li>Scan the QR code below</li>
          <li>Enter the 6-digit code to confirm</li>
        </ol>

        <div className="flex justify-center mb-4">
          <div className="p-3 border rounded-xl bg-white inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="TOTP QR code" width={180} height={180} />
          </div>
        </div>

        <div className="text-center mb-5">
          <button
            onClick={() => setShowSecret(!showSecret)}
            className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            {showSecret ? 'Hide' : "Can't scan? Enter code manually"}
          </button>
          {showSecret && (
            <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg border">
              <p className="font-mono text-sm text-gray-800 break-all tracking-wider">{secret}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setStep('confirm')}
          className="w-full py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          I&apos;ve scanned it →
        </button>
      </div>
    )
  }

  // ── Step 2: Confirm code ─────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-5">
          Enter the 6-digit code shown in your authenticator app to confirm setup.
        </p>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Authentication code
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6)
              setCode(val)
              setError(null)
            }}
            placeholder="000000"
            className="w-full text-center text-2xl font-mono tracking-[0.4em] px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            disabled={loading}
          />
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading || code.replace(/\s/g, '').length !== 6}
          className="w-full py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying…' : 'Confirm & enable 2FA'}
        </button>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setStep('scan'); setCode(''); setError(null) }}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Backup codes ─────────────────────────────────────────────────
  if (step === 'backup') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-green-700">Two-factor authentication enabled</span>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Save these backup codes somewhere safe — a password manager works great.
          Each code can only be used once, and they&apos;re your only way in if you lose
          your authenticator app.
        </p>

        <div className="bg-gray-50 rounded-lg border p-4 mb-4">
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((c) => (
              <span key={c} className="font-mono text-sm text-gray-800 text-center py-1 bg-white rounded border">
                {c}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={downloadBackupCodes}
          className="w-full mb-4 py-2 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download backup codes
        </button>

        <label className="flex items-start gap-2.5 cursor-pointer select-none mb-5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span className="text-sm text-gray-700">
            I&apos;ve saved my backup codes in a safe place
          </span>
        </label>

        <button
          onClick={() => {
            if (onComplete) {
              onComplete()
            } else if (redirect) {
              router.push(redirect)
            }
          }}
          disabled={!acknowledged}
          className="w-full py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue →
        </button>
      </div>
    )
  }

  return null
}
