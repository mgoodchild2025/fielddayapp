'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { requireOrgMember } from '@/lib/auth'

export const MAX_MESSAGE_CHARS = 100

export const TIMING_OPTIONS = [
  { minutes: 15,   label: '15 minutes before' },
  { minutes: 30,   label: '30 minutes before' },
  { minutes: 60,   label: '1 hour before' },
  { minutes: 120,  label: '2 hours before' },
  { minutes: 180,  label: '3 hours before' },
  { minutes: 360,  label: '6 hours before' },
  { minutes: 720,  label: '12 hours before' },
  { minutes: 1440, label: '24 hours before' },
]

export const DEFAULT_MESSAGES: Record<number, string> = {
  15:   "Your game starts in 15 minutes!",
  30:   "Your game starts in 30 minutes.",
  60:   "Your game is in 1 hour. Time to warm up!",
  120:  "Your game is in 2 hours.",
  180:  "Your game is in 3 hours.",
  360:  "Your game is in 6 hours.",
  720:  "Your game is tonight!",
  1440: "Your game is tomorrow. See you there!",
}

export type SmsReminder = {
  id?: string
  minutesBefore: number
  messageTemplate: string
  enabled: boolean
}

export type NotificationSettings = {
  smsGameRemindersEnabled: boolean
  reminders: SmsReminder[]
}

type OrgNotifRow = { sms_game_reminders_enabled: boolean } | null
type OrgSmsReminderRow = {
  id: string
  minutes_before: number
  message_template: string
  enabled: boolean
  sort_order: number
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: notif }, { data: reminders }] = await Promise.all([
    (db as any)
      .from('org_notification_settings')
      .select('sms_game_reminders_enabled')
      .eq('organization_id', org.id)
      .single() as Promise<{ data: OrgNotifRow }>,
    (db as any)
      .from('org_sms_reminders')
      .select('id, minutes_before, message_template, enabled, sort_order')
      .eq('organization_id', org.id)
      .order('sort_order', { ascending: true }) as Promise<{ data: OrgSmsReminderRow[] | null }>,
  ])

  return {
    smsGameRemindersEnabled: (notif as OrgNotifRow)?.sms_game_reminders_enabled ?? true,
    reminders: (reminders ?? []).map((r) => ({
      id: r.id,
      minutesBefore: r.minutes_before,
      messageTemplate: r.message_template,
      enabled: r.enabled,
    })),
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])
  const db = createServiceRoleClient()

  // Validate messages
  for (const r of settings.reminders) {
    if (r.messageTemplate.length > MAX_MESSAGE_CHARS) {
      return { error: `Message for ${r.minutesBefore}-minute reminder exceeds ${MAX_MESSAGE_CHARS} characters.` }
    }
    if (!r.messageTemplate.trim()) {
      return { error: 'All reminders must have a message.' }
    }
  }

  // 1. Upsert master toggle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: notifErr } = await (db as any)
    .from('org_notification_settings')
    .upsert(
      { organization_id: org.id, sms_game_reminders_enabled: settings.smsGameRemindersEnabled, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    ) as { error: { message: string } | null }

  if (notifErr) return { error: notifErr.message }

  // 2. Replace all reminders (delete + insert — simpler than diffing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (db as any)
    .from('org_sms_reminders')
    .delete()
    .eq('organization_id', org.id) as { error: { message: string } | null }

  if (delErr) return { error: delErr.message }

  if (settings.reminders.length > 0) {
    const rows = settings.reminders.map((r, i) => ({
      organization_id: org.id,
      minutes_before: r.minutesBefore,
      message_template: r.messageTemplate.trim(),
      enabled: r.enabled,
      sort_order: i,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (db as any)
      .from('org_sms_reminders')
      .insert(rows) as { error: { message: string } | null }

    if (insErr) return { error: insErr.message }
  }

  revalidatePath('/admin/settings/notifications')
  return { error: null }
}
