import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMfaStatus } from '@/lib/mfa'
import { MfaGraceBanner } from '@/components/mfa/mfa-grace-banner'
import { getPlatformStripeMode } from '@/lib/stripe-platform'
import { SuperNav } from '@/components/platform/super-nav'

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('platform_role')
    .eq('id', user.id)
    .single()

  if (profile?.platform_role !== 'platform_admin') redirect('/')

  // MFA enforcement for platform admins
  let mfaGraceDaysLeft: number | null = null
  const mfa = await getMfaStatus()

  if (!mfa.isVerified) {
    if (mfa.needsVerify) {
      redirect('/mfa/verify?redirect=/super')
    }

    // No factor enrolled — check / start grace period
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRow } = await (db as any)
      .from('profiles')
      .select('mfa_grace_until')
      .eq('id', user.id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graceUntil = (profileRow as any)?.mfa_grace_until
      ? new Date((profileRow as any).mfa_grace_until)
      : null
    const now = new Date()

    if (!graceUntil) {
      const graceEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('profiles').update({ mfa_grace_until: graceEnd.toISOString() }).eq('id', user.id)
      mfaGraceDaysLeft = 14
    } else if (graceUntil <= now) {
      redirect('/mfa/setup?redirect=/super')
    } else {
      mfaGraceDaysLeft = Math.ceil(
        (graceUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )
    }
  }

  const stripeMode = await getPlatformStripeMode()

  return (
    <div className="min-h-screen bg-gray-950">
      {mfaGraceDaysLeft !== null && <MfaGraceBanner daysLeft={mfaGraceDaysLeft} />}
      <SuperNav email={user.email ?? ''} stripeTest={stripeMode === 'test'} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  )
}
