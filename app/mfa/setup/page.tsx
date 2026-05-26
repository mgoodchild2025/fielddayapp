/**
 * /mfa/setup
 *
 * TOTP enrollment page.  Intentionally does NOT check getMfaStatus() here —
 * doing so would cause a redirect(safeRedirect) to fire after verifyEnrollment()
 * completes (because Next.js revalidates the router cache after server actions,
 * re-running the server component which would then see isVerified=true and
 * redirect before the client can show the backup codes step).
 *
 * All enrollment logic lives in <MfaSetupClient> so that client-component state
 * (including the backup codes step) survives the router cache revalidation.
 */

import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { MfaSetupClient } from './setup-client'

interface Props {
  searchParams: Promise<{ redirect?: string }>
}

export default async function MfaSetupPage({ searchParams }: Props) {
  const { redirect: redirectTo } = await searchParams
  const safeRedirect = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent('/mfa/setup')}`)

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={40} height={40} className="rounded-lg" />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Set up two-factor authentication</h1>
          <p className="text-sm text-gray-500">
            Protect your account with an authenticator app.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <MfaSetupClient redirect={safeRedirect} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Need help?{' '}
          <a href="mailto:support@fielddayapp.ca" className="underline underline-offset-2">
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
