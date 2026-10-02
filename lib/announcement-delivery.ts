import { createServiceRoleClient } from '@/lib/supabase/service'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms, toE164 } from '@/lib/twilio'
import { canAccess } from '@/lib/features'
import { getMarketingConsentBatch, getMarketingOptInUserIds } from '@/lib/marketing-consent'
import { unsubscribeUrl, interestUnsubscribeUrl } from '@/lib/unsubscribe'

/**
 * Announcement fan-out (email + SMS) — used by actions/messages.ts (after its
 * own admin check) and the reminders cron (scheduled sends).
 *
 * Deliberately NOT in a 'use server' file: every export there is a public
 * endpoint, and this takes an orgId + message from its caller with no auth of
 * its own — it was reachable by anyone while exported from actions/messages.ts.
 */

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

export async function deliverAnnouncement(
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

    const { data: regs } = await service
      .from('registrations')
      .select('user_id')
      .eq('organization_id', orgId)
      .not('user_id', 'is', null)
    for (const r of regs ?? []) if (r.user_id) userIds.add(r.user_id)

  } else if (data.audience_type === 'marketing') {
    const optedIn = await getMarketingOptInUserIds(orgId)
    for (const id of optedIn) userIds.add(id)

  } else if (data.audience_type === 'event_interest' && data.league_id) {

    const { data: rows } = await service
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

    const { data: members } = await service
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const m of members ?? []) if (m.user_id) userIds.add(m.user_id)

  } else if (data.audience_type === 'league' && data.league_id) {

    const { data: regs } = await service
      .from('registrations')
      .select('user_id')
      .eq('league_id', data.league_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const r of regs ?? []) if (r.user_id) userIds.add(r.user_id)

  } else if (data.audience_type === 'team' && data.team_id) {

    const { data: members } = await service
      .from('team_members')
      .select('user_id')
      .eq('team_id', data.team_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
    for (const m of members ?? []) if (m.user_id) userIds.add(m.user_id)

  } else if (data.audience_type === 'players' && data.user_ids && data.user_ids.length > 0) {
    // Verify each selected user is actually a member of this org (scope safety)

    const { data: members } = await service
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

    const { data: admins } = await service
      .from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active')
    for (const a of admins ?? []) if (a.user_id) { userIds.add(a.user_id); exemptUserIds.add(a.user_id) }
  }

  if (userIds.size === 0 && rawEmails.size === 0) return

  // ── 3. Fetch profiles for all recipients in one query ─────────────────────

  const { data: profiles } = userIds.size > 0
    ? await service
        .from('profiles')
        .select('id, email, phone, sms_opted_in')
        .in('id', [...userIds])
    : { data: [] }

  const recipients: Recipient[] = (profiles ?? []).map((p) => ({
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

