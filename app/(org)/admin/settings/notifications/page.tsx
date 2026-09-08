import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getNotificationSettings } from '@/actions/notification-settings'
import { NotificationSettingsForm } from './notification-settings-form'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { pushConfigured } from '@/lib/push'

export default async function NotificationSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  if (!await canAccess(org.id, 'sms_notifications')) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Notifications</h1>
        <p className="text-sm text-gray-500 mb-6">Configure automated messages sent to players and alerts sent to admins.</p>
        <UpgradePrompt feature="SMS notifications" requiredTier="pro" />
      </div>
    )
  }

  const settings = await getNotificationSettings()

  // Phone-alert reach: members with ≥1 push subscription for this org site.
  const db = createServiceRoleClient()
  const [{ count: memberCount }, { data: subRows }] = await Promise.all([
    db.from('org_members').select('user_id', { count: 'exact', head: true }).eq('organization_id', org.id),
    db.from('push_subscriptions').select('user_id').eq('organization_id', org.id),
  ])
  const pushReach = {
    configured: pushConfigured(),
    reachable: new Set((subRows ?? []).map((r) => r.user_id)).size,
    members: memberCount ?? 0,
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Configure automated messages sent to players and alerts sent to admins.</p>
      </div>
      <div className="mb-6 rounded-lg border bg-white p-4 flex items-start gap-3">
        <span className="text-xl" aria-hidden>📱</span>
        <div className="text-sm">
          <p className="font-medium text-gray-900">Phone alerts</p>
          {pushReach.configured ? (
            <p className="text-gray-600 mt-0.5">
              <span className="font-semibold">{pushReach.reachable}</span> of {pushReach.members} members can receive push alerts on a phone.
              Reminders reach them as push notifications and skip the text unless a player asked for both, so each
              player who installs the site saves you an SMS per reminder.
            </p>
          ) : (
            <p className="text-gray-600 mt-0.5">Push alerts aren&rsquo;t configured on this platform yet; reminders go by email and SMS only.</p>
          )}
        </div>
      </div>
      <NotificationSettingsForm initial={settings} />
    </div>
  )
}
