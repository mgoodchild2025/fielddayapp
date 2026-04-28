'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getResend, FROM_EMAIL } from '@/lib/resend'

const sendSchema = z.object({
  title: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message body required'),
  audience_type: z.enum(['org', 'league', 'team']).default('org'),
  league_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  scheduled_for: z.string().optional().nullable(),
})

export async function sendAnnouncement(input: FormData) {
  const raw = {
    title: input.get('title') as string,
    body: input.get('body') as string,
    audience_type: input.get('audience_type') as string || 'org',
    league_id: (input.get('league_id') as string) || undefined,
    team_id: (input.get('team_id') as string) || undefined,
    scheduled_for: (input.get('scheduled_for') as string) || null,
  }

  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: member } = await supabase
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

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      organization_id: org.id,
      title: parsed.data.title,
      body: parsed.data.body,
      audience_type: parsed.data.audience_type,
      league_id: parsed.data.league_id ?? null,
      team_id: parsed.data.team_id ?? null,
      sent_by: user.id,
      sent_at: isImmediate ? new Date().toISOString() : null,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      email_sent: false,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (isImmediate && announcement) {
    await deliverAnnouncementEmails(announcement.id, org.id, parsed.data).catch(() => {})
  }

  revalidatePath('/admin/messages')
  return { error: null }
}

async function deliverAnnouncementEmails(
  announcementId: string,
  orgId: string,
  data: { title: string; body: string; audience_type: string; league_id?: string; team_id?: string }
) {
  const service = createServiceRoleClient()

  let emails: string[] = []

  if (data.audience_type === 'org') {
    const { data: members } = await service
      .from('org_members')
      .select('profiles(email)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
    emails = (members ?? [])
      .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
      .map(p => p?.email)
      .filter(Boolean) as string[]
  } else if (data.audience_type === 'league' && data.league_id) {
    const { data: regs } = await service
      .from('registrations')
      .select('profiles(email)')
      .eq('league_id', data.league_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
    emails = (regs ?? [])
      .flatMap(r => (Array.isArray(r.profiles) ? r.profiles : [r.profiles]))
      .map(p => p?.email)
      .filter(Boolean) as string[]
  }

  if (emails.length === 0) return

  const resend = getResend()
  const BATCH_SIZE = 50
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: batch,
      subject: data.title,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="font-size:20px;font-weight:bold">${data.title}</h2>
        <div style="white-space:pre-wrap;line-height:1.6">${data.body}</div>
      </div>`,
    })
  }

  await service
    .from('announcements')
    .update({ email_sent: true })
    .eq('id', announcementId)
}

export { deliverAnnouncementEmails }

export async function deleteAnnouncement(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/messages')
  return { error: null }
}
