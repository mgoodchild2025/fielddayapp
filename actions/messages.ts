'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms, toE164 } from '@/lib/twilio'

const sendSchema = z.object({
  title: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message body required'),
  audience_type: z.enum(['org', 'league', 'team']).default('org'),
  league_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  scheduled_for: z.string().optional().nullable(),
  channel: z.enum(['email', 'sms', 'both']).default('email'),
  cc_self: z.boolean().default(false),
  cc_admins: z.boolean().default(false),
})

export async function sendAnnouncement(input: FormData) {
  const raw = {
    title:         input.get('title') as string,
    body:          input.get('body') as string,
    audience_type: (input.get('audience_type') as string) || 'org',
    league_id:     (input.get('league_id') as string) || undefined,
    team_id:       (input.get('team_id') as string) || undefined,
    scheduled_for: (input.get('scheduled_for') as string) || null,
    channel:       (input.get('channel') as string) || 'email',
    cc_self:       input.get('cc_self') === 'on',
    cc_admins:     input.get('cc_admins') === 'on',
  }

  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()

  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }

  const scheduledFor = parsed.data.scheduled_for ? new Date(parsed.data.scheduled_for) : null
  const isImmediate = !scheduledFor || scheduledFor <= new Date()

  const { data: announcement, error } = await db
    .from('announcements')
    .insert({
      organization_id: org.id,
      title:           parsed.data.title,
      body:            parsed.data.body,
      audience_type:   parsed.data.audience_type,
      league_id:       parsed.data.league_id ?? null,
      team_id:         parsed.data.team_id ?? null,
      sent_by:         user.id,
      sent_at:         isImmediate ? new Date().toISOString() : null,
      scheduled_for:   scheduledFor?.toISOString() ?? null,
      email_sent:      false,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (isImmediate && announcement) {
    await deliverAnnouncement(announcement.id, org.id, org.name ?? '', user.id, parsed.data).catch(() => {})
  }

  revalidatePath('/admin/messages')
  return { error: null }
}

// ── Delivery ──────────────────────────────────────────────────────────────────

type DeliveryData = {
  title: string
  body: string
  audience_type: string
  league_id?: string
  team_id?: string
  channel?: 'email' | 'sms' | 'both'
  cc_self?: boolean
  cc_admins?: boolean
}

type Recipient = { email: string | null; phone: string | null; sms_opted_in: boolean }

async function deliverAnnouncement(
  announcementId: string,
  orgId: string,
  orgNameOrData: string | DeliveryData,
  senderIdOrUndefined?: string,
  dataOrUndefined?: DeliveryData,
) {
  // Support both the new 5-arg call and the legacy 3-arg call from the cron route
  let orgName: string
  let senderId: string
  let data: DeliveryData
  if (typeof orgNameOrData === 'string') {
    orgName = orgNameOrData
    senderId = senderIdOrUndefined ?? ''
    data = dataOrUndefined!
  } else {
    orgName = ''
    senderId = ''
    data = orgNameOrData
  }
  const service = createServiceRoleClient()

  // Resolve org name if not supplied (cron path passes empty string)
  if (!orgName) {
    const { data: orgRow } = await service.from('organizations').select('name').eq('id', orgId).single()
    orgName = orgRow?.name ?? 'Fieldday'
  }

  // ── 1. Collect primary audience user IDs ──────────────────────────────────
  const userIds = new Set<string>()

  if (data.audience_type === 'org') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: members } = await (service as any)
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const m of members ?? []) if (m.user_id) userIds.add(m.user_id)

  } else if (data.audience_type === 'league' && data.league_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: regs } = await (service as any)
      .from('registrations')
      .select('user_id')
      .eq('league_id', data.league_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const r of regs ?? []) if (r.user_id) userIds.add(r.user_id)

  } else if (data.audience_type === 'team' && data.team_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: members } = await (service as any)
      .from('team_members')
      .select('user_id')
      .eq('team_id', data.team_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const m of members ?? []) if (m.user_id) userIds.add(m.user_id)
  }

  // ── 2. CC additions ───────────────────────────────────────────────────────
  if (data.cc_self && senderId) {
    userIds.add(senderId)
  }

  if (data.cc_admins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: admins } = await (service as any)
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active')
    for (const a of admins ?? []) if (a.user_id) userIds.add(a.user_id)
  }

  if (userIds.size === 0) return

  // ── 3. Fetch profiles for all recipients in one query ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (service as any)
    .from('profiles')
    .select('id, email, phone, sms_opted_in')
    .in('id', [...userIds])

  const recipients: Recipient[] = (profiles ?? []).map((p: { email?: string; phone?: string; sms_opted_in?: boolean }) => ({
    email:        p.email ?? null,
    phone:        p.phone ?? null,
    sms_opted_in: p.sms_opted_in ?? false,
  }))

  const channel = data.channel ?? 'email'
  const sendEmail = channel === 'email' || channel === 'both'
  const sendSmsChannel = channel === 'sms' || channel === 'both'

  // ── 4. Email ──────────────────────────────────────────────────────────────
  if (sendEmail) {
    const emails = recipients.map((r) => r.email).filter(Boolean) as string[]
    if (emails.length > 0) {
      const resend = getResend()
      const BATCH_SIZE = 50
      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="font-size:20px;font-weight:bold">${data.title}</h2>
        <div style="white-space:pre-wrap;line-height:1.6">${data.body}</div>
        <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin-top:24px;line-height:1.6;">
          This message was sent to you by <strong>${orgName}</strong>, powered by Fieldday.<br>
          You&rsquo;re receiving this because you&rsquo;re a member of this organization. To manage your notification preferences, log in and visit your profile settings.
        </p>
      </div>`
      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: emails.slice(i, i + BATCH_SIZE),
          subject: data.title,
          html,
        })
      }
      await service.from('announcements').update({ email_sent: true }).eq('id', announcementId)
    }
  }

  // ── 5. SMS ────────────────────────────────────────────────────────────────
  if (sendSmsChannel) {
    const smsBody = `${orgName}\n\n${data.title}\n\n${data.body}\n\nReply STOP to unsubscribe.`
    const smsRecipients = recipients.filter((r) => r.phone && r.sms_opted_in)
    await Promise.allSettled(
      smsRecipients.map((r) => sendSms(toE164(r.phone!), smsBody))
    )
  }
}

// Keep legacy export name so the cron job can still import it
export { deliverAnnouncement as deliverAnnouncementEmails }

export async function deleteAnnouncement(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/messages')
  return { error: null }
}
