'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms, toE164 } from '@/lib/twilio'
import { canAccess } from '@/lib/features'
import { getMarketingConsentBatch, getMarketingOptInUserIds } from '@/actions/player-consents'
import { unsubscribeUrl, interestUnsubscribeUrl } from '@/lib/unsubscribe'
import { parseLocalToUtc } from '@/lib/format-time'
import { recordAuditLog } from '@/lib/audit'

const sendSchema = z.object({
  title: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message body required'),
  audience_type: z.enum(['org', 'league', 'team', 'players', 'past_participants', 'marketing', 'event_interest']).default('org'),
  league_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  user_ids: z.array(z.string().uuid()).optional(),
  scheduled_for: z.string().optional().nullable(),
  channel: z.enum(['email', 'sms', 'both']).default('email'),
  // CASL: transactional = operational (sent to all); commercial = promotional
  // (gated by per-recipient marketing consent + carries an unsubscribe link).
  message_class: z.enum(['transactional', 'commercial']).default('transactional'),
  cc_self: z.boolean().default(false),
  cc_admins: z.boolean().default(false),
})

export async function sendAnnouncement(input: FormData) {
  // user_ids arrives as a JSON-encoded array from the form
  let userIds: string[] | undefined
  const rawUserIds = input.get('user_ids') as string | null
  if (rawUserIds) {
    try { userIds = JSON.parse(rawUserIds) } catch { userIds = undefined }
  }

  const raw = {
    title:         input.get('title') as string,
    body:          input.get('body') as string,
    audience_type: (input.get('audience_type') as string) || 'org',
    league_id:     (input.get('league_id') as string) || undefined,
    team_id:       (input.get('team_id') as string) || undefined,
    user_ids:      userIds,
    scheduled_for: (input.get('scheduled_for') as string) || null,
    channel:       (input.get('channel') as string) || 'email',
    message_class: (input.get('message_class') as string) || 'transactional',
    cc_self:       input.get('cc_self') === 'on',
    cc_admins:     input.get('cc_admins') === 'on',
  }

  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  // Validate audience-specific requirements
  if (parsed.data.audience_type === 'league' && !parsed.data.league_id) {
    return { error: 'Please select a league.' }
  }
  if (parsed.data.audience_type === 'team' && !parsed.data.team_id) {
    return { error: 'Please select a team.' }
  }
  if (parsed.data.audience_type === 'players' && (!parsed.data.user_ids || parsed.data.user_ids.length === 0)) {
    return { error: 'Please select at least one player.' }
  }
  // The notify-me list is event-specific — keep promos locked to that event.
  if (parsed.data.audience_type === 'event_interest' && !parsed.data.league_id) {
    return { error: 'Please select the event whose interest list you want to message.' }
  }

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

  // The datetime-local value ("YYYY-MM-DDTHH:MM") is wall-clock time in the org's
  // local timezone. Interpret it in that zone — NOT the server's (UTC) — otherwise
  // a future local time can resolve to a past UTC instant and send immediately.
  let scheduledFor: Date | null = null
  if (parsed.data.scheduled_for) {
    const [datePart, timePart] = parsed.data.scheduled_for.split('T')
    if (datePart && timePart) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: branding } = await (db as any)
        .from('org_branding')
        .select('timezone')
        .eq('organization_id', org.id)
        .maybeSingle()
      const tz = branding?.timezone || 'America/Toronto'
      scheduledFor = new Date(parseLocalToUtc(datePart, timePart.slice(0, 5), tz))
    } else {
      scheduledFor = new Date(parsed.data.scheduled_for)
    }
  }
  const isImmediate = !scheduledFor || scheduledFor <= new Date()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: announcement, error } = await (db as any)
    .from('announcements')
    .insert({
      organization_id:    org.id,
      title:              parsed.data.title,
      body:               parsed.data.body,
      audience_type:      parsed.data.audience_type,
      league_id:          parsed.data.league_id ?? null,
      team_id:            parsed.data.team_id ?? null,
      recipient_user_ids: parsed.data.audience_type === 'players' ? (parsed.data.user_ids ?? []) : null,
      message_class:      parsed.data.message_class,
      channel:            parsed.data.channel,
      sent_by:            user.id,
      sent_at:            isImmediate ? new Date().toISOString() : null,
      scheduled_for:      scheduledFor?.toISOString() ?? null,
      email_sent:         false,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Persist cc intent so the scheduled (cron) path can honour "send me a copy".
  // Best-effort: ignored if migration 169 (cc columns) isn't applied yet.
  if (announcement && (parsed.data.cc_self || parsed.data.cc_admins)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('announcements')
      .update({ cc_self: parsed.data.cc_self, cc_admins: parsed.data.cc_admins })
      .eq('id', announcement.id)
      .then(() => {}, () => {})
  }

  if (isImmediate && announcement) {
    await deliverAnnouncement(announcement.id, org.id, org.name ?? '', user.id, parsed.data).catch(() => {})
  }

  await recordAuditLog({
    orgId: org.id,
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: 'message.sent',
    targetType: 'announcement',
    targetId: announcement?.id ?? null,
    targetLabel: parsed.data.title,
    metadata: {
      audience_type: parsed.data.audience_type,
      channel: parsed.data.channel,
      message_class: parsed.data.message_class,
      scheduled: !isImmediate,
    },
  })

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
  user_ids?: string[]
  channel?: 'email' | 'sms' | 'both'
  message_class?: 'transactional' | 'commercial'
  cc_self?: boolean
  cc_admins?: boolean
  /** Used by the scheduled (cron) path, which has no live sender — the sender
   *  is recovered from announcements.sent_by so cc-self still works. */
  sender_id?: string
}

type Recipient = { id: string; email: string | null; phone: string | null; sms_opted_in: boolean }

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
  // Raw email recipients with NO account (event-interest non-user signups).
  const rawEmails = new Map<string, { interestId?: string }>()
  // User IDs exempt from the commercial marketing-consent gate because they have
  // explicit consent of another kind: event-interest signups (opted in for this
  // event) and CC'd staff (operational copies, not marketing to a customer).
  const exemptUserIds = new Set<string>()

  if (data.audience_type === 'past_participants') {
    // Anyone who has registered for any of this org's events. CASL: commercial
    // sends are consent-gated below, so only marketing opt-ins are reached.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: regs } = await (service as any)
      .from('registrations')
      .select('user_id')
      .eq('organization_id', orgId)
      .not('user_id', 'is', null)
    for (const r of regs ?? []) if (r.user_id) userIds.add(r.user_id)

  } else if (data.audience_type === 'marketing') {
    const optedIn = await getMarketingOptInUserIds(orgId)
    for (const id of optedIn) userIds.add(id)

  } else if (data.audience_type === 'event_interest' && data.league_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (service as any)
      .from('event_interest')
      .select('id, email, user_id')
      .eq('league_id', data.league_id)
      .eq('organization_id', orgId)
      .is('unsubscribed_at', null)
    for (const row of rows ?? []) {
      if (row.user_id) { userIds.add(row.user_id); exemptUserIds.add(row.user_id) }
      else if (row.email) rawEmails.set(String(row.email).toLowerCase(), { interestId: row.id })
    }

  } else if (data.audience_type === 'org') {
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

  } else if (data.audience_type === 'players' && data.user_ids && data.user_ids.length > 0) {
    // Verify each selected user is actually a member of this org (scope safety)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: members } = await (service as any)
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('user_id', data.user_ids)
    for (const m of members ?? []) if (m.user_id) userIds.add(m.user_id)
  }

  // ── 2. CC additions ───────────────────────────────────────────────────────
  // On the scheduled (cron) path there's no live sender arg — recover it from
  // the stored data so "send me a copy" still works.
  const ccSender = senderId || data.sender_id || ''
  if (data.cc_self && ccSender) {
    userIds.add(ccSender)
    exemptUserIds.add(ccSender)
  }

  if (data.cc_admins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: admins } = await (service as any)
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active')
    for (const a of admins ?? []) if (a.user_id) { userIds.add(a.user_id); exemptUserIds.add(a.user_id) }
  }

  if (userIds.size === 0 && rawEmails.size === 0) return

  // ── 3. Fetch profiles for all recipients in one query ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = userIds.size > 0
    ? await (service as any)
        .from('profiles')
        .select('id, email, phone, sms_opted_in')
        .in('id', [...userIds])
    : { data: [] }

  const recipients: Recipient[] = (profiles ?? []).map((p: { id: string; email?: string; phone?: string; sms_opted_in?: boolean }) => ({
    id:           p.id,
    email:        p.email ?? null,
    phone:        p.phone ?? null,
    sms_opted_in: p.sms_opted_in ?? false,
  }))

  const channel = data.channel ?? 'email'
  const isCommercial = data.message_class === 'commercial'
  const sendEmail = channel === 'email' || channel === 'both'
  const sendSmsChannel = channel === 'sms' || channel === 'both'

  // ── CASL gate: for commercial messages, only recipients with active marketing
  // consent may be contacted. Transactional (operational) messages are exempt.
  let emailConsent: Set<string> | null = null
  let smsConsent: Set<string> | null = null
  if (isCommercial) {
    const consent = await getMarketingConsentBatch(orgId, recipients.map((r) => r.id))
    emailConsent = consent.email
    smsConsent = consent.sms
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://fielddayapp.ca'

  // ── 4. Email ──────────────────────────────────────────────────────────────
  if (sendEmail) {
    const resend = getResend()
    const renderHtml = (unsubLink: string | null) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;font-weight:bold">${data.title}</h2>
      <div style="white-space:pre-wrap;line-height:1.6">${data.body}</div>
      <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin-top:24px;line-height:1.6;">
        This message was sent to you by <strong>${orgName}</strong>, powered by Fieldday.<br>
        ${
          unsubLink
            ? `You&rsquo;re receiving this because you signed up for updates from this organization. <a href="${unsubLink}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>.`
            : `You&rsquo;re receiving this because you&rsquo;re a member of this organization. To manage your notification preferences, log in and visit your profile settings.`
        }
      </p>
    </div>`

    let emailSentAny = false

    // Profile-backed recipients (consent-gated for commercial, except the
    // exempt set: event-interest signups + CC'd staff).
    const emailRecipients = recipients.filter(
      (r) => r.email && (!isCommercial || emailConsent!.has(r.id) || exemptUserIds.has(r.id))
    )
    if (emailRecipients.length > 0) {
      if (isCommercial) {
        // Personalised unsubscribe link per recipient → must send individually
        await Promise.allSettled(
          emailRecipients.map((r) =>
            resend.emails.send({
              from: FROM_EMAIL,
              to: r.email!,
              subject: data.title,
              html: renderHtml(unsubscribeUrl(origin, orgId, r.id, 'marketing_email')),
            })
          )
        )
      } else {
        const emails = emailRecipients.map((r) => r.email!) as string[]
        const BATCH_SIZE = 50
        const html = renderHtml(null)
        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: emails.slice(i, i + BATCH_SIZE),
            subject: data.title,
            html,
          })
        }
      }
      emailSentAny = true
    }

    // Raw event-interest recipients (no account) — explicit per-event opt-in, so
    // always sent with their own interest-unsubscribe link.
    if (rawEmails.size > 0) {
      await Promise.allSettled(
        [...rawEmails].map(([email, meta]) =>
          resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: data.title,
            html: renderHtml(meta.interestId ? interestUnsubscribeUrl(origin, meta.interestId) : null),
          })
        )
      )
      emailSentAny = true
    }

    if (emailSentAny) {
      await service.from('announcements').update({ email_sent: true }).eq('id', announcementId)
    }
  }

  // ── 5. SMS ────────────────────────────────────────────────────────────────
  if (sendSmsChannel) {
    // Server-side feature gate — prevents bypass via direct API calls
    const smsAllowed = await canAccess(orgId, 'sms_notifications')
    if (!smsAllowed) {
      console.warn(`[messages] org ${orgId} attempted SMS send without sms_notifications access`)
    } else {
      const smsBody = `${orgName}\n\n${data.title}\n\n${data.body}\n\nReply STOP to unsubscribe.`
      const smsRecipients = recipients.filter(
        (r) => r.phone && r.sms_opted_in && (!isCommercial || smsConsent!.has(r.id) || exemptUserIds.has(r.id))
      )
      await Promise.allSettled(
        smsRecipients.map((r) => sendSms(toE164(r.phone!), smsBody))
      )
    }
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
