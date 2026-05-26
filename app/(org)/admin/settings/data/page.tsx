import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgDataControls } from '@/components/settings/org-data-controls'

const EXPORT_WINDOW_DAYS = 30

export const dynamic = 'force-dynamic'

export default async function AdminDataPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (db as any)
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'org_admin') redirect('/admin/dashboard')

  // Fetch subscription + org retention state
  const [{ data: subscription }, { data: orgRow }, { data: recentLogs }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('subscriptions')
      .select('status, current_period_end, plan_tier')
      .eq('organization_id', org.id)
      .single(),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations')
      .select('data_deidentified_at')
      .eq('id', org.id)
      .single(),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_data_retention_logs')
      .select('event_type, triggered_by, player_count, created_at, notes')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // Determine export window status
  let exportWindowStatus: 'open' | 'closed' | 'active_subscription' = 'active_subscription'
  let exportWindowEndsAt: string | null = null
  let exportWindowClosedAt: string | null = null
  let daysLeftInWindow: number | null = null

  if (subscription?.status === 'canceled' && subscription.current_period_end) {
    const canceledAt = new Date(subscription.current_period_end)
    const windowEnd = new Date(canceledAt.getTime() + EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const now = new Date()

    if (now > windowEnd) {
      exportWindowStatus = 'closed'
      exportWindowClosedAt = windowEnd.toISOString()
    } else {
      exportWindowStatus = 'open'
      exportWindowEndsAt = windowEnd.toISOString()
      daysLeftInWindow = Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  const canExport = exportWindowStatus !== 'closed'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Data & Privacy</h1>
      <p className="text-sm text-gray-500 mb-6">
        Export your organization&apos;s player data and manage data retention settings.
      </p>

      {/* Export window banner — show warning when canceled */}
      {exportWindowStatus === 'open' && daysLeftInWindow !== null && daysLeftInWindow <= 14 && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Export window closing soon</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Your subscription has been canceled. You have <strong>{daysLeftInWindow} day{daysLeftInWindow !== 1 ? 's' : ''}</strong> remaining
              to export player data before the window closes on{' '}
              {exportWindowEndsAt ? new Date(exportWindowEndsAt).toLocaleDateString('en-CA', { dateStyle: 'long' }) : ''}.
            </p>
          </div>
        </div>
      )}

      {exportWindowStatus === 'closed' && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">Export window has closed</p>
            <p className="text-sm text-red-700 mt-0.5">
              The 30-day export window following your subscription cancellation ended on{' '}
              {exportWindowClosedAt ? new Date(exportWindowClosedAt).toLocaleDateString('en-CA', { dateStyle: 'long' }) : ''}.
              Player data will be de-identified by Fieldday within 60 days of the window closing.
              Contact <a href="mailto:privacy@fielddayapp.ca" className="underline">privacy@fielddayapp.ca</a> with questions.
            </p>
          </div>
        </div>
      )}

      <OrgDataControls
        orgId={org.id}
        canExport={canExport}
        exportWindowStatus={exportWindowStatus}
        exportWindowEndsAt={exportWindowEndsAt}
        dataDeidentifiedAt={orgRow?.data_deidentified_at ?? null}
        recentLogs={recentLogs ?? []}
      />
    </div>
  )
}
