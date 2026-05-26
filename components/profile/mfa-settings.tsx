'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enrollTotp, unenrollMfa } from '@/actions/mfa'
import { TotpEnroll } from '@/components/mfa/totp-enroll'

interface Props {
  isEnrolled: boolean
  factorId: string | null
}

export function MfaSettings({ isEnrolled: initialEnrolled, factorId: initialFactorId }: Props) {
  const router = useRouter()
  const [enrolled, setEnrolled] = useState(initialEnrolled)
  const [factorId, setFactorId] = useState<string | null>(initialFactorId)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeCode, setRemoveCode] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  async function handleStartEnroll() {
    setEnrolling(true)
    const result = await enrollTotp()
    if (result.error || !result.factorId) {
      setEnrolling(false)
      return
    }
    setEnrollData({ factorId: result.factorId, qrCode: result.qrCode!, secret: result.secret! })
  }

  function handleEnrollComplete() {
    // After backup codes are acknowledged, update local state and refresh
    // the server component to reflect the newly enrolled factor.
    setEnrolled(true)
    setEnrolling(false)
    setEnrollData(null)
    router.refresh()
  }

  async function handleRemove() {
    if (!factorId) return
    setRemoveLoading(true)
    setRemoveError(null)
    const result = await unenrollMfa(factorId, removeCode)
    if (result.error) {
      setRemoveError(result.error)
      setRemoveLoading(false)
    } else {
      setEnrolled(false)
      setFactorId(null)
      setRemoving(false)
      setRemoveCode('')
    }
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 mb-0.5">Two-factor authentication</h2>

          {!enrolled && !enrolling && (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Add an extra layer of security by requiring a code from your authenticator
                app each time you sign in.
              </p>
              <button
                onClick={handleStartEnroll}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Enable two-factor authentication
              </button>
            </>
          )}

          {enrolling && !enrollData && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}

          {enrolling && enrollData && (
            <div className="mt-4">
              <TotpEnroll
                factorId={enrollData.factorId}
                qrCode={enrollData.qrCode}
                secret={enrollData.secret}
                onComplete={handleEnrollComplete}
              />
            </div>
          )}

          {enrolled && !removing && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-700">Authenticator app is active.</p>
              </div>
              <button
                onClick={() => setRemoving(true)}
                className="text-sm text-red-600 hover:text-red-700 underline underline-offset-2"
              >
                Remove authenticator
              </button>
            </>
          )}

          {enrolled && removing && (
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-3">
                Enter your current authenticator code to confirm removal.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={removeCode}
                onChange={(e) => {
                  setRemoveCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                  setRemoveError(null)
                }}
                placeholder="000000"
                className="w-32 text-center font-mono text-lg tracking-widest px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 mb-2"
                disabled={removeLoading}
              />
              {removeError && (
                <p className="text-sm text-red-600 mb-2">{removeError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleRemove}
                  disabled={removeLoading || removeCode.length !== 6}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
                >
                  {removeLoading ? 'Removing…' : 'Remove'}
                </button>
                <button
                  onClick={() => { setRemoving(false); setRemoveCode(''); setRemoveError(null) }}
                  className="px-3 py-1.5 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
