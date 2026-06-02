'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { requireOrgMember } from '@/lib/auth'
import { MAX_MESSAGE_CHARS } from '@/lib/notification-settings-constants'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { buildCaptainPrepEmail, sampleCaptainPrepData } from '@/lib/emails/captain-prep'

export type SmsReminder = {
  id?: string
  minutesBefore: number
  messageTemplate: string
  enabled: boolean
}

export type NotificationSettings = {
  smsGameRemindersEnabled: boolean
  reminders: SmsReminder[]
  emailGameRemindersEnabled: boolean
  emailReminderHoursBefore: number
  captainPrepEmailEnabled: boolean
  registrationNotificationsEnabled: boolean
  /** Custom recipient email. When null, notifications go to all org_admin members. */
  registrationNotificationEmail: string | null
  /** Alert org admins when a Stripe payment fails. */
  paymentFailureNotificationsEnabled: boolean
}

type OrgNotifRow = {
  sms_game_reminders_enabled: boolean
  email_game_reminders_enabled: boolean
  email_reminder_hours_before: number
  captain_prep_email_enabled: boolean
  registration_notifications_enabled: boolean
  registration_notification_email: string | null
  payment_failure_notifications_enabled: boolean
} | null
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
      .select('sms_game_reminders_enabled, email_game_reminders_enabled, email_reminder_hours_before, captain_prep_email_enabled, registration_notifications_enabled, registration_notification_email, payment_failure_notifications_enabled')
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
    emailGameRemindersEnabled: (notif as OrgNotifRow)?.email_game_reminders_enabled ?? true,
    emailReminderHoursBefore: (notif as OrgNotifRow)?.email_reminder_hours_before ?? 24,
    captainPrepEmailEnabled: (notif as OrgNotifRow)?.captain_prep_email_enabled ?? false,
    registrationNotificationsEnabled: (notif as OrgNotifRow)?.registration_notifications_enabled ?? false,
    registrationNotificationEmail: (notif as OrgNotifRow)?.registration_notification_email ?? null,
    paymentFailureNotificationsEnabled: (notif as OrgNotifRow)?.payment_failure_notifications_enabled ?? true,
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])
  const db = createServiceRoleClient()

  // Validate recipient email when provided
  const recipientEmail = settings.registrationNotificationEmail?.trim() || null
  if (recipientEmail) {
    const emailParse = z.string().email().safeParse(recipientEmail)
    if (!emailParse.success) {
      return { error: 'Please enter a valid recipient email address' }
    }
  }

  // Validate messages
  for (const r of settings.reminders) {
    if (r.messageTemplate.length > MAX_MESSAGE_CHARS) {
      return { error: `Message for ${r.minutesBefore}-minute reminder exceeds ${MAX_MESSAGE_CHARS} characters.` }
    }
    if (!r.messageTemplate.trim()) {
      return { error: 'All reminders must have a message.' }
    }
  }

  // 1. Upsert master toggle + registration notification settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: notifErr } = await (db as any)
    .from('org_notification_settings')
    .upsert(
      {
        organization_id: org.id,
        sms_game_reminders_enabled: settings.smsGameRemindersEnabled,
        email_game_reminders_enabled: settings.emailGameRemindersEnabled,
        email_reminder_hours_before: settings.emailReminderHoursBefore,
        captain_prep_email_enabled: settings.captainPrepEmailEnabled,
        registration_notifications_enabled: settings.registrationNotificationsEnabled,
        registration_notification_email: settings.registrationNotificationEmail?.trim() || null,
        payment_failure_notifications_enabled: settings.paymentFailureNotificationsEnabled,
        updated_at: new Date().toISOString(),
      },
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

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

/**
 * Send a sample captain prep email to the org admin who clicked the button,
 * so they can preview what captains/coaches will receive.
 */
export async function sendCaptainPrepTestEmail(): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Could not determine your email address.' }

  const { subject, html } = buildCaptainPrepEmail(
    sampleCaptainPrepData({
      orgName: org.name ?? 'Your Organization',
      orgSlug: org.slug ?? '',
      platformDomain: PLATFORM_DOMAIN,
    })
  )

  try {
    const resend = getResend()
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `[TEST] ${subject}`,
      html,
    })
    return { error: null }
  } catch (err) {
    console.error('[notifications] captain prep test email error:', err)
    return { error: 'Failed to send test email. Please try again.' }
  }
}
