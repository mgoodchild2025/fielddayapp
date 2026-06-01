import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMfaStatus } from '@/lib/mfa'
import { MfaGraceBanner } from '@/components/mfa/mfa-grace-banner'

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

  return (
    <div className="min-h-screen bg-gray-950">
      {mfaGraceDaysLeft !== null && <MfaGraceBanner daysLeft={mfaGraceDaysLeft} />}
      <nav className="bg-gray-900 border-b border-gray-800 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={28} height={28} className="rounded" />
          <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Platform Admin</span>
          <Link href="/super" className="text-sm text-gray-400 hover:text-white transition-colors">Organizations</Link>
          <Link href="/super/settings" className="text-sm text-gray-400 hover:text-white transition-colors">Settings</Link>
          <Link href="/super/settings/plans" className="text-sm text-gray-400 hover:text-white transition-colors">Plan Config</Link>
          <Link href="/super/legal" className="text-sm text-gray-400 hover:text-white transition-colors">Legal Docs</Link>
          <Link href="/super/compliance" className="text-sm text-gray-400 hover:text-white transition-colors">Compliance</Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">{user.email}</span>
          <a href="/login" className="text-gray-400 hover:text-white">Sign out</a>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
