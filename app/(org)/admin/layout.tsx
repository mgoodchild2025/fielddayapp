import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getMfaStatus } from '@/lib/mfa'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { BillingBanner } from '@/components/layout/billing-banner'
import { LimitWarningBanner } from '@/components/layout/limit-warning-banner'
import { MfaGraceBanner } from '@/components/mfa/mfa-grace-banner'
import { getLimit, getActiveLeagueCount } from '@/lib/features'
import { getEnforcementState } from '@/lib/billing'
import { getPendingReacceptance } from '@/actions/tenant-consent'

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

  // Reacceptance check for org_admin (not impersonating)
  if (memberRole === 'org_admin' && !isImpersonating) {
    const pending = await getPendingReacceptance(org.id)
    if (pending.length > 0) {
      const pathname = headersList.get('x-pathname') ?? '/admin/dashboard'
      // Only block if not already on the reaccept page to avoid redirect loop
      if (!pathname.startsWith('/reaccept')) {
        redirect(`/reaccept?redirect=${encodeURIComponent(pathname)}`)
      }
    }
  }

  // Fetch subscription + plan limits in parallel for banners
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: subscription }, playerLimit, leagueLimit, activeLeagueCount, { count: playerCount }, enforcement] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('subscriptions')
      .select('status, trial_end, cancel_at_period_end, current_period_end, hibernate_until, pre_hibernate_tier')
      .eq('organization_id', org.id)
      .single() as Promise<{ data: { status: string; trial_end: string | null; cancel_at_period_end: boolean | null; current_period_end: string | null; hibernate_until: string | null; pre_hibernate_tier: string | null } | null }>,
    getLimit(org.id, 'max_players'),
    getLimit(org.id, 'max_leagues'),
    getActiveLeagueCount(org.id),
    db
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('role', 'player')
      .eq('status', 'active'),
    getEnforcementState(org.id),
  ])

  return (
    <div
      className={`h-dvh flex flex-col overflow-hidden pt-14 print:pt-0 print:h-auto print:overflow-visible print:block ${isImpersonating ? 'lg:pt-10' : 'lg:pt-0'}`}
      style={{ backgroundColor: '#F8F8F8' }}
    >
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
          hibernateUntil={subscription?.hibernate_until ?? null}
          preHibernateTier={subscription?.pre_hibernate_tier ?? null}
        />
      </div>
      <div className="print:hidden">
        <LimitWarningBanner
          playerCount={playerCount ?? 0}
          playerLimit={playerLimit}
          leagueCount={activeLeagueCount}
          leagueLimit={leagueLimit}
          graceDaysLeft={enforcement.graceDaysLeft}
          inGracePeriod={enforcement.inGracePeriod}
        />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden"><AdminSidebar org={org} role={memberRole} /></div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="p-4 lg:p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  )
}
