'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'

export type NotificationSettings = {
  smsGameRemindersEnabled: boolean
  smsReminderHoursBefore: number
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('org_notification_settings')
    .select('sms_game_reminders_enabled, sms_reminder_hours_before')
    .eq('organization_id', org.id)
    .single() as { data: { sms_game_reminders_enabled: boolean; sms_reminder_hours_before: number } | null }

  return {
    smsGameRemindersEnabled: data?.sms_game_reminders_enabled ?? true,
    smsReminderHoursBefore: data?.sms_reminder_hours_before ?? 3,
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_notification_settings')
    .upsert(
      {
        organization_id: org.id,
        sms_game_reminders_enabled: settings.smsGameRemindersEnabled,
        sms_reminder_hours_before: settings.smsReminderHoursBefore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    ) as { error: { message: string } | null }

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/notifications')
  return { error: null }
}
