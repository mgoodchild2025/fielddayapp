'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { impersonationGrantsAdmin } from '@/lib/impersonation'
import { getScoringRole } from '@/lib/score-permissions'
import { trustedOrigin } from '@/lib/trusted-origin'
import { sendEmail, buildScorekeeperInviteEmail } from '@/lib/email'
import { createNotifications } from '@/lib/notify'

// Scorekeepers: volunteers who enter scores for one event and nothing else.
// Managed by whoever runs the event (org admins, and league admins who are an
// active organizer of it). See lib/scoring-role.ts for what they can do.

const INVITE_DAYS = 30

export type ScorekeeperRow = {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'active'
  expired: boolean
  /** Pending invites only — for "Copy link" (text it to a volunteer). */
  inviteUrl: string | null
}

/** The caller runs this event (org admin, or one of its organizers). */
async function requireEventManager(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  const db = createServiceRoleClient()
  const { data: league } = await db
    .from('leagues').select('id, name')
    .eq('id', leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return { error: 'Event not found' as const }
  const impersonating = impersonationGrantsAdmin(headersList.get('x-impersonating'), user)
  const role = await getScoringRole(db, org.id, user.id, league.id, { impersonating })
  if (role !== 'admin') return { error: 'Only this event’s organisers can manage scorekeepers' as const }
  return { org, user, db, league, headersList }
}

export async function listEventScorekeepers(leagueId: string): Promise<{ rows: ScorekeeperRow[]; error: string | null }> {
  if (!z.string().uuid().safeParse(leagueId).success) return { rows: [], error: 'Invalid input' }
  const ctx = await requireEventManager(leagueId)
  if ('error' in ctx) return { rows: [], error: ctx.error ?? null }
  const { db, org, headersList } = ctx

  const { data } = await db
    .from('event_scorekeepers')
    .select('id, invited_email, status, expires_at, token, user_id, created_at')
    .eq('organization_id', org.id)
    .eq('league_id', leagueId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: true })
  const rows = data ?? []

  const userIds = rows.map((r) => r.user_id).filter((v): v is string => !!v)
  const { data: profiles } = userIds.length
    ? await db.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const origin = await trustedOrigin(headersList)
  const now = Date.now()

  return {
    error: null,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.invited_email,
      name: r.user_id ? nameOf.get(r.user_id) ?? null : null,
      status: r.status === 'active' ? 'active' : 'pending',
      expired: r.status === 'pending' && new Date(r.expires_at).getTime() < now,
      inviteUrl: r.status === 'pending' ? `${origin}/scorekeeper-invite/${r.token}` : null,
    })),
  }
}

const inviteSchema = z.object({
  leagueId: z.string().uuid(),
  email: z.string().trim().email(),
})

export async function inviteScorekeeper(input: { leagueId: string; email: string }): Promise<{ error: string | null; inviteUrl?: string; id?: string }> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Enter a valid email address' }
  const ctx = await requireEventManager(parsed.data.leagueId)
  if ('error' in ctx) return { error: ctx.error ?? 'Not allowed' }
  const { db, org, user, league, headersList } = ctx
  const email = parsed.data.email.toLowerCase()

  const { data: existing } = await db
    .from('event_scorekeepers').select('id, status')
    .eq('league_id', league.id).eq('invited_email', email).maybeSingle()
  if (existing?.status === 'active') return { error: `${email} is already a scorekeeper for this event` }

  const { data: existingProfile } = await db
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) {
    const { data: adminRow } = await db
      .from('org_members').select('role')
      .eq('organization_id', org.id).eq('user_id', existingProfile.id)
      .eq('status', 'active').eq('role', 'org_admin').maybeSingle()
    if (adminRow) return { error: `${email} is an org admin and can already enter scores` }
  }

  const token = crypto.randomUUID()
  const { data: saved, error: upsertError } = await db
    .from('event_scorekeepers')
    .upsert({
      organization_id: org.id,
      league_id: league.id,
      invited_email: email,
      invited_by: user.id,
      user_id: null,
      status: 'pending',
      token,
      expires_at: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'league_id,invited_email' })
    .select('id')
    .single()
  if (upsertError || !saved) return { error: 'Could not create the invitation. Try again.' }

  const inviteUrl = `${await trustedOrigin(headersList)}/scorekeeper-invite/${token}`
  const { data: inviter } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const inviterName = inviter?.full_name ?? 'An organiser'

  if (existingProfile?.id) {
    await createNotifications({
      organization_id: org.id,
      user_id: existingProfile.id,
      type: 'scorekeeper_invite',
      title: `Keep score at ${league.name}?`,
      body: `${inviterName} asked you to enter scores for ${league.name}.`,
      data: { href: `/scorekeeper-invite/${token}`, link_label: 'View invitation', league_id: league.id },
    })
  }
  await sendEmail({
    to: email,
    subject: `Keep score at ${league.name}`,
    html: buildScorekeeperInviteEmail({ orgName: org.name, leagueName: league.name, inviterName, acceptUrl: inviteUrl }),
  })

  revalidatePath(`/admin/events/${league.id}`)
  return { error: null, inviteUrl, id: saved.id }
}

export async function removeScorekeeper(input: { leagueId: string; id: string }): Promise<{ error: string | null }> {
  const parsed = z.object({ leagueId: z.string().uuid(), id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }
  const ctx = await requireEventManager(parsed.data.leagueId)
  if ('error' in ctx) return { error: ctx.error ?? 'Not allowed' }
  const { error } = await ctx.db
    .from('event_scorekeepers')
    .update({ status: 'removed' })
    .eq('id', parsed.data.id)
    .eq('league_id', ctx.league.id)
    .eq('organization_id', ctx.org.id)
  if (error) return { error: 'Could not remove the scorekeeper. Try again.' }
  revalidatePath(`/admin/events/${ctx.league.id}`)
  return { error: null }
}

// ─── The volunteer's side ────────────────────────────────────────────────────

export type ScorekeeperInvite = {
  status: 'pending' | 'active' | 'removed'
  email: string
  expired: boolean
  leagueName: string
  inviterName: string | null
}

/** Invite page details. The token is the secret; nothing here acts. */
export async function getScorekeeperInvite(token: string): Promise<ScorekeeperInvite | null> {
  if (!z.string().uuid().safeParse(token).success) return null
  const org = await getCurrentOrg(await headers())
  const db = createServiceRoleClient()
  const { data: invite } = await db
    .from('event_scorekeepers')
    .select('status, invited_email, expires_at, league_id, invited_by')
    .eq('token', token).eq('organization_id', org.id).maybeSingle()
  if (!invite) return null
  const [{ data: league }, inviterRes] = await Promise.all([
    db.from('leagues').select('name').eq('id', invite.league_id).maybeSingle(),
    invite.invited_by
      ? db.from('profiles').select('full_name').eq('id', invite.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    status: invite.status as ScorekeeperInvite['status'],
    email: invite.invited_email,
    expired: invite.status === 'pending' && new Date(invite.expires_at).getTime() < Date.now(),
    leagueName: league?.name ?? 'this event',
    inviterName: (inviterRes.data as { full_name: string | null } | null)?.full_name ?? null,
  }
}

export async function acceptScorekeeperInvite(token: string): Promise<{ error: string | null }> {
  if (!z.string().uuid().safeParse(token).success) return { error: 'Invitation not found' }
  const org = await getCurrentOrg(await headers())
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to accept this invitation' }
  const db = createServiceRoleClient()

  const { data: invite } = await db
    .from('event_scorekeepers')
    .select('id, status, invited_email, expires_at, user_id')
    .eq('token', token).eq('organization_id', org.id).maybeSingle()
  if (!invite) return { error: 'Invitation not found' }
  if (invite.status === 'active' && invite.user_id === user.id) return { error: null }
  if (invite.status !== 'pending') return { error: 'This invitation is no longer active. Ask the organiser for a new one.' }
  if (new Date(invite.expires_at).getTime() < Date.now()) return { error: 'This invitation has expired. Ask the organiser for a new one.' }

  // The link may be forwarded: only the invited address can take it up.
  const { data: profile } = await db.from('profiles').select('email').eq('id', user.id).maybeSingle()
  const myEmail = (profile?.email ?? user.email ?? '').toLowerCase()
  if (myEmail !== invite.invited_email.toLowerCase()) {
    return { error: `This invitation was sent to ${invite.invited_email}. Sign in with that email address.` }
  }

  const { error } = await db
    .from('event_scorekeepers')
    .update({ status: 'active', user_id: user.id })
    .eq('id', invite.id).eq('status', 'pending')
  if (error) return { error: 'Could not accept the invitation. Try again.' }
  revalidatePath('/dashboard')
  return { error: null }
}
