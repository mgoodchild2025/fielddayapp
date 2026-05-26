'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verifyMfa, verifyBackupCode } from '@/actions/mfa'

interface Props {
  factorId: string
  redirect: string
}

export function TotpChallenge({ factorId, redirect }: Props) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBackup, setShowBackup] = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.replace(/\s/g, '').length === 6 && !loading) {
      handleVerify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function handleVerify() {
    const digits = code.replace(/\s/g, '')
    if (digits.length !== 6) return
    setLoading(true)
    setError(null)
    const result = await verifyMfa(factorId, digits)
    if (result.error) {
      setError(result.error)
      setCode('')
      setLoading(false)
      inputRef.current?.focus()
    } else {
      router.push(redirect)
    }
  }

  async function handleBackupCode() {
    if (!backupCode.trim()) return
    setBackupLoading(true)
    setBackupError(null)
    const result = await verifyBackupCode(backupCode)
    if (result.error) {
      setBackupError(result.error)
      setBackupLoading(false)
    } else {
      router.push(redirect)
    }
  }

  return (
    <div>
      {!showBackup ? (
        <>
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Authentication code
            </label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
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
            onClick={handleVerify}
            disabled={loading || code.replace(/\s/g, '').length !== 6}
            className="w-full py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <div className="mt-4 text-center">
            <button
              onClick={() => setShowBackup(true)}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Use a backup code instead
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-5">
            <p className="text-sm text-gray-600 mb-3">
              Enter one of your backup codes. After use it will be invalidated and
              you&apos;ll need to re-enroll your authenticator app.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup code
            </label>
            <input
              type="text"
              autoComplete="off"
              value={backupCode}
              onChange={(e) => {
                setBackupCode(e.target.value.toUpperCase())
                setBackupError(null)
              }}
              placeholder="XXXXX-XXXXX"
              className="w-full text-center font-mono tracking-widest px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={backupLoading}
            />
            {backupError && (
              <p className="mt-2 text-sm text-red-600">{backupError}</p>
            )}
          </div>

          <button
            onClick={handleBackupCode}
            disabled={backupLoading || !backupCode.trim()}
            className="w-full py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {backupLoading ? 'Verifying…' : 'Use backup code'}
          </button>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setShowBackup(false); setBackupCode(''); setBackupError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              ← Back to authenticator code
            </button>
          </div>
        </>
      )}
    </div>
  )
}
