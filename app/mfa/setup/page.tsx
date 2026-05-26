/**
 * /mfa/setup
 *
 * TOTP enrollment page — walks the user through scanning a QR code and
 * confirming setup.  Works for any logged-in user regardless of org/platform
 * context.
 *
 * Org admins are redirected here from the admin layout when:
 *  - Their 14-day grace period has expired AND they have no TOTP factor enrolled.
 *
 * Platform admins are redirected here from the super layout under the same rule.
 *
 * Players/captains arrive here voluntarily from their profile security settings.
 */

import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { getMfaStatus } from '@/lib/mfa'
import { enrollTotp } from '@/actions/mfa'
import { TotpEnroll } from '@/components/mfa/totp-enroll'

interface Props {
  searchParams: Promise<{ redirect?: string }>
}

export default async function MfaSetupPage({ searchParams }: Props) {
  const { redirect: redirectTo } = await searchParams
  const safeRedirect = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent('/mfa/setup')}`)

  const mfa = await getMfaStatus()

  // Already verified — nothing to do
  if (mfa.isVerified && mfa.hasTotp) redirect(safeRedirect)

  // If factor exists but session isn't aal2 — redirect to verify instead
  if (mfa.needsVerify) redirect(`/mfa/verify?redirect=${encodeURIComponent(safeRedirect)}`)

  // Begin enrollment — generates a new pending TOTP factor
  const enrollment = await enrollTotp()

  if (enrollment.error || !enrollment.factorId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-red-600 text-sm">
            Could not start enrollment: {enrollment.error ?? 'Unknown error'}
          </p>
          <a href="/dashboard" className="mt-4 inline-block text-sm underline text-gray-600">
            ← Back to dashboard
          </a>
        </div>
      </div>
    )
  }

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
          <TotpEnroll
            factorId={enrollment.factorId}
            qrCode={enrollment.qrCode!}
            secret={enrollment.secret!}
            redirect={safeRedirect}
          />
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
