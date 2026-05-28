import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { getNotificationSettings } from '@/actions/notification-settings'
import { NotificationSettingsForm } from './notification-settings-form'

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

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Configure automated messages sent to players and alerts sent to admins.</p>
      </div>
      <NotificationSettingsForm initial={settings} />
    </div>
  )
}
