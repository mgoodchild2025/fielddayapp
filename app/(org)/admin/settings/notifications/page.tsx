import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getNotificationSettings } from '@/actions/notification-settings'
import { NotificationSettingsForm } from './notification-settings-form'

export default async function NotificationSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const settings = await getNotificationSettings()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/settings" className="text-sm text-gray-400 hover:text-gray-600">
          ← Settings
        </Link>
        <h1 className="text-2xl font-bold mt-1">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Configure automated messages sent to your players.</p>
      </div>

      <NotificationSettingsForm initial={settings} />
    </div>
  )
}
