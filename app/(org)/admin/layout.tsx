import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { BillingBanner } from '@/components/layout/billing-banner'

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

  if (!isImpersonating) {
    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single()

    if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
      redirect('/dashboard')
    }

    memberRole = member.role
  }

  // Fetch subscription for billing banner
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, trial_end, cancel_at_period_end, current_period_end')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className={`min-h-screen flex flex-col ${isImpersonating ? 'pt-10' : ''}`} style={{ backgroundColor: '#F8F8F8' }}>
      {isImpersonating && <div className="print:hidden"><ImpersonationBanner orgName={org.name} /></div>}
      <div className="print:hidden">
        <BillingBanner
          status={subscription?.status ?? 'trialing'}
          trialEnd={subscription?.trial_end ?? null}
          cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
          currentPeriodEnd={subscription?.current_period_end ?? null}
        />
      </div>
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        <AdminSidebar org={org} role={memberRole} />
        <main className="flex-1 overflow-auto print:overflow-visible">
          {/* pt-14 on mobile accounts for the fixed top bar; removed on lg where sidebar is visible */}
          <div className="pt-14 lg:pt-0 p-4 lg:p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  )
}
