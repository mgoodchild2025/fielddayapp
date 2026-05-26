/**
 * /mfa/verify
 *
 * TOTP challenge page — shown to any logged-in user who has a TOTP factor
 * enrolled but hasn't verified it this session (aal1 → needs aal2).
 *
 * Works for both org users (on org subdomains) and platform admins
 * (on app.fielddayapp.ca) — no org context required.
 */

import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { getMfaStatus } from '@/lib/mfa'
import { TotpChallenge } from '@/components/mfa/totp-challenge'

interface Props {
  searchParams: Promise<{ redirect?: string }>
}

export default async function MfaVerifyPage({ searchParams }: Props) {
  const { redirect: redirectTo } = await searchParams
  const safeRedirect = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent('/mfa/verify')}`)

  const mfa = await getMfaStatus()

  // Already verified — send them on their way
  if (mfa.isVerified) redirect(safeRedirect)

  // No factor enrolled — they shouldn't be here; send to setup
  if (!mfa.hasTotp) redirect(`/mfa/setup?redirect=${encodeURIComponent(safeRedirect)}`)

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={40} height={40} className="rounded-lg" />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Two-factor authentication</h1>
          <p className="text-sm text-gray-500">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <TotpChallenge factorId={mfa.factorId!} redirect={safeRedirect} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Having trouble?{' '}
          <a href="mailto:support@fielddayapp.ca" className="underline underline-offset-2">
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
