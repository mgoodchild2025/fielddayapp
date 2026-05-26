'use client'

/**
 * Client-driven MFA setup flow.
 *
 * Calling enrollTotp() and verifyEnrollment() here (client-side) rather than
 * in the server component means that when Next.js revalidates the router cache
 * after verifyEnrollment() completes, the server component at /mfa/setup simply
 * re-renders to <MfaSetupClient> — there is no redirect logic in the server
 * component that could fire and prevent the backup codes from being shown.
 */

import { useState, useEffect } from 'react'
import { enrollTotp } from '@/actions/mfa'
import { TotpEnroll } from '@/components/mfa/totp-enroll'

interface Props {
  redirect: string
}

export function MfaSetupClient({ redirect }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enrollData, setEnrollData] = useState<{
    factorId: string
    qrCode: string
    secret: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    enrollTotp().then((result) => {
      if (cancelled) return
      if (result.error || !result.factorId) {
        setError(result.error ?? 'Could not start enrollment.')
      } else {
        setEnrollData({
          factorId: result.factorId,
          qrCode: result.qrCode!,
          secret: result.secret!,
        })
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500">
        <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Setting up…
      </div>
    )
  }

  if (error || !enrollData) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-red-600 mb-3">{error ?? 'Unknown error'}</p>
        <a href="/dashboard" className="text-sm underline text-gray-600">← Back to dashboard</a>
      </div>
    )
  }

  return (
    <TotpEnroll
      factorId={enrollData.factorId}
      qrCode={enrollData.qrCode}
      secret={enrollData.secret}
      redirect={redirect}
    />
  )
}
