'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { parseLocalToUtc } from '@/lib/format-time'
import { recordAuditLog } from '@/lib/audit'
import { deliverAnnouncement } from '@/lib/announcement-delivery'

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
    .eq('user_id', user.id).eq('status', 'active')
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

      const { data: branding } = await db
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


  const { data: announcement, error } = await db
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

    await db.from('announcements')
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


export async function deleteAnnouncement(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()

  // Being signed in is not enough: an announcement belongs to the
  // organization, so deleting one is an admin action.
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id).eq('status', 'active')
    .in('role', ['org_admin', 'league_admin'])
    .maybeSingle()
  if (!member) return { error: 'Admin access required' }

  const { error } = await db
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/messages')
  return { error: null }
}
