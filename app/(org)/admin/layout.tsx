import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMfaStatus } from '@/lib/mfa'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { BillingBanner } from '@/components/layout/billing-banner'
import { MfaGraceBanner } from '@/components/mfa/mfa-grace-banner'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const isImpersonating = headersList.get('x-impersonating') === '1'
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let memberRole: string = 'org_admin'
  let mfaGraceDaysLeft: number | null = null

  if (!isImpersonating) {
    // Use service role for this membership check — RLS on org_members requires
    // app.current_org_id to be set in the Postgres session, which the session
    // client does not provide.  The explicit eq() filters enforce org scoping.
    const db = createServiceRoleClient()
    const { data: member } = await db
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single()

    if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
      redirect('/dashboard')
    }

    memberRole = member.role

    // MFA enforcement — mandatory for org_admin only
    if (memberRole === 'org_admin') {
      const mfa = await getMfaStatus()

      if (!mfa.isVerified) {
        const pathname = headersList.get('x-pathname') ?? '/admin/dashboard'

        if (mfa.needsVerify) {
          // Factor enrolled but not yet verified this session → go verify
          redirect(`/mfa/verify?redirect=${encodeURIComponent(pathname)}`)
        }

        // No factor enrolled → check or start grace period
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
          // First time: start 14-day grace period
          const graceEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any)
            .from('profiles')
            .update({ mfa_grace_until: graceEnd.toISOString() })
            .eq('id', user.id)
          mfaGraceDaysLeft = 14
        } else if (graceUntil <= now) {
          // Grace expired → force setup
          redirect(`/mfa/setup?redirect=${encodeURIComponent(pathname)}`)
        } else {
          // Grace still active → show warning banner
          mfaGraceDaysLeft = Math.ceil(
            (graceUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          )
        }
      }
    }
  }

  // Fetch subscription for billing banner (service role — same reason)
  const db = createServiceRoleClient()
  const { data: subscription } = await db
    .from('subscriptions')
    .select('status, trial_end, cancel_at_period_end, current_period_end')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className={`min-h-screen flex flex-col ${isImpersonating ? 'pt-10' : ''}`} style={{ backgroundColor: '#F8F8F8' }}>
      {isImpersonating && <div className="print:hidden"><ImpersonationBanner orgName={org.name} /></div>}
      {mfaGraceDaysLeft !== null && (
        <div className="print:hidden">
          <MfaGraceBanner daysLeft={mfaGraceDaysLeft} />
        </div>
      )}
      <div className="print:hidden">
        <BillingBanner
          status={subscription?.status ?? 'trialing'}
          trialEnd={subscription?.trial_end ?? null}
          cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
          currentPeriodEnd={subscription?.current_period_end ?? null}
        />
      </div>
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><AdminSidebar org={org} role={memberRole} /></div>
        <main className="flex-1 overflow-auto print:overflow-visible">
          {/* pt-14 on mobile accounts for the fixed top bar; removed on lg where sidebar is visible */}
          <div className="pt-14 lg:pt-0 p-4 lg:p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  )
}
