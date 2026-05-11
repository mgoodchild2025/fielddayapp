'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sendEmail, buildTeamInviteEmail } from '@/lib/email'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InviteDetails {
  id: string
  status: string
  role: string
  invited_email: string
  expires_at: string
  team_id: string
  team_name: string
  team_color: string | null
  inviter_name: string | null
  league_name: string | null
  league_slug: string | null
  member_count: number
  max_team_size: number | null
}

// ─── Get invite details (no auth required — for page preview) ─────────────────

export async function getInviteDetails(token: string): Promise<InviteDetails | null> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, status, role, invited_email, expires_at, team_id, invited_by')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: team }, { data: inviter }] = await Promise.all([
    (db as any).from('teams').select('name, color, league_id').eq('id', invite.team_id).single(),
    db.from('profiles').select('full_name').eq('id', invite.invited_by).single(),
  ])

  // Fetch league info + member count in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueId = (team as any)?.league_id ?? null
  const [leagueResult, { count: memberCount }] = await Promise.all([
    leagueId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (db as any).from('leagues').select('name, slug, max_team_size').eq('id', leagueId).single()
      : Promise.resolve({ data: null }),
    db.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', invite.team_id).eq('status', 'active'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league = (leagueResult as any)?.data ?? null

  return {
    id: invite.id,
    status: invite.status,
    role: invite.role,
    invited_email: invite.invited_email,
    expires_at: invite.expires_at,
    team_id: invite.team_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team_name: (team as any)?.name ?? 'Unknown Team',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team_color: (team as any)?.color ?? null,
    inviter_name: inviter?.full_name ?? null,
    league_name: (league as { name?: string } | null)?.name ?? null,
    league_slug: (league as { slug?: string } | null)?.slug ?? null,
    member_count: memberCount ?? 0,
    max_team_size: (league as { max_team_size?: number | null } | null)?.max_team_size ?? null,
  }
}

// ─── Send invite ──────────────────────────────────────────────────────────────

const sendInviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['captain', 'coach', 'player', 'sub']).default('player'),
})

export async function sendTeamInvite(input: z.infer<typeof sendInviteSchema>) {
  const parsed = sendInviteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is captain/coach or org admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    db.from('team_members').select('role')
      .eq('team_id', parsed.data.teamId)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .single(),
    db.from('org_members').select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single(),
  ])

  const isTeamManager = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isTeamManager && !isOrgAdmin) return { error: 'Not authorized' }

  const email = parsed.data.email.toLowerCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    (db as any).from('teams').select('id, name, league_id, leagues!teams_league_id_fkey(name)').eq('id', parsed.data.teamId).eq('organization_id', org.id).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  if (!team) return { error: 'Team not found' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueRow = Array.isArray((team as any).leagues) ? (team as any).leagues[0] : (team as any).leagues
  const leagueName: string | null = (leagueRow as { name?: string } | null)?.name ?? null

  // Check if already a member (by email or user_id)
  const { data: inviteeProfile } = await db
    .from('profiles').select('id').eq('email', email).maybeSingle()

  const { data: existingMember } = await db
    .from('team_members')
    .select('id')
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)
    .eq(inviteeProfile?.id ? 'user_id' : 'invited_email', inviteeProfile?.id ?? email)
    .maybeSingle()

  if (existingMember) return { error: `${email} is already on this team` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  // Delete any stale pending invite for this email+team before inserting a fresh one.
  // This handles orphaned invites left behind when a player was removed from the org,
  // or any other case where the unique constraint would otherwise fire.
  await anyDb
    .from('team_invitations')
    .delete()
    .eq('team_id', parsed.data.teamId)
    .ilike('invited_email', email)
    .eq('status', 'pending')

  // Create invitation
  const { data: invite, error: inviteError } = await anyDb
    .from('team_invitations')
    .insert({
      team_id: parsed.data.teamId,
      organization_id: org.id,
      invited_email: email,
      invited_user_id: inviteeProfile?.id ?? null,
      invited_by: user.id,
      role: parsed.data.role,
    })
    .select('id, token, expires_at')
    .single()

  if (inviteError) return { error: inviteError.message }

  // Build accept/decline URLs from current request host
  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/invite/${invite.token}`
  const declineUrl = `${origin}/invite/${invite.token}?action=decline`

  const inviterName = inviterProfile?.full_name ?? 'A manager'

  // In-app notification if the invitee has an account
  if (inviteeProfile?.id) {
    await db.from('notifications').insert({
      organization_id: org.id,
      user_id: inviteeProfile.id,
      type: 'team_invite',
      title: `You've been invited to join ${team.name}`,
      body: `${inviterName} invited you${leagueName ? ` for ${leagueName}` : ''} as ${parsed.data.role}. Tap to view the invite.`,
      data: { token: invite.token, accept_url: acceptUrl },
    })
  }

  // Send email (no-op if RESEND_API_KEY is not set)
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${team.name}${leagueName ? ` — ${leagueName}` : ''}`,
    html: buildTeamInviteEmail({
      teamName: team.name,
      leagueName,
      orgName: org.name,
      invitedBy: inviterName,
      role: parsed.data.role,
      acceptUrl,
      declineUrl,
    }),
  })

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return {
    error: null,
    invite: {
      id: invite.id as string,
      token: invite.token as string,
      invitedEmail: parsed.data.email,
      role: parsed.data.role,
      expiresAt: invite.expires_at as string,
    },
  }
}

// ─── Accept invitation ────────────────────────────────────────────────────────

export async function acceptTeamInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', teamId: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, team_id, invited_email, invited_by, role, status, expires_at')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found', teamId: null }
  if (invite.status === 'accepted') return { error: 'This invitation has already been accepted', teamId: invite.team_id }
  if (invite.status !== 'pending') return { error: 'This invitation is no longer active', teamId: null }
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired', teamId: null }

  // Verify the logged-in user's email matches the invite
  const { data: profile } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()
  if (profile?.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
    return { error: `This invite was sent to ${invite.invited_email} — please sign in with that account`, teamId: null }
  }

  // Add to team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberError } = await (db as any).from('team_members').upsert({
    organization_id: org.id,
    team_id: invite.team_id,
    user_id: user.id,
    invited_email: invite.invited_email,
    role: invite.role,
    status: 'active',
  }, { onConflict: 'team_id,user_id' })

  if (memberError) return { error: memberError.message, teamId: null }

  // Ensure org membership
  await db.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  // Mark invite accepted
  await anyDb.from('team_invitations').update({ status: 'accepted' }).eq('id', invite.id)

  // Mark the in-app notification as read
  await db.from('notifications')
    .update({ read: true })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('type', 'team_invite')

  // Fetch team + league info for registration check and notification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: team } = await (db as any)
    .from('teams')
    .select('name, league_id, team_code, leagues!teams_league_id_fkey(slug, status, price_cents, payment_mode)')
    .eq('id', invite.team_id)
    .single()

  const teamName = team?.name ?? 'your team'

  // Notify the inviter
  const playerName = profile?.full_name ?? invite.invited_email
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: invite.invited_by,
    type: 'invite_accepted',
    title: `${playerName} accepted your invitation`,
    body: `They've joined ${teamName}.`,
  })

  revalidatePath('/dashboard')
  revalidatePath(`/teams/${invite.team_id}`)

  // Handle league registration
  if (team?.league_id) {
    const { data: existingReg } = await db
      .from('registrations')
      .select('id, status')
      .eq('organization_id', org.id)
      .eq('league_id', team.league_id)
      .eq('user_id', user.id)
      .maybeSingle()

    const league = Array.isArray(team.leagues) ? team.leagues[0] : team.leagues
    const leagueStatus = (league as { status?: string } | null)?.status
    const leagueSlug = (league as { slug?: string } | null)?.slug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaguePriceCents: number = (league as any)?.price_cents ?? 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentMode: string = (league as any)?.payment_mode ?? 'per_player'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamCode = (team as any)?.team_code

    const canRouteToRegister =
      leagueSlug &&
      (leagueStatus === 'registration_open' || leagueStatus === 'active') &&
      leaguePriceCents > 0 &&
      paymentMode !== 'per_team'

    if (!existingReg) {
      if (canRouteToRegister) {
        // Send player through the registration flow so they complete waiver + payment.
        // For active leagues the register page allows entry when the player is already
        // a team member (added above), which is always true at this point.
        redirect(`/register/${leagueSlug!}${teamCode ? `?code=${teamCode}` : ''}`)
      } else if (leagueSlug && (leagueStatus === 'registration_open' || leagueStatus === 'active')) {
        // Free event — redirect through register to capture waiver (no payment step shown).
        redirect(`/register/${leagueSlug}${teamCode ? `?code=${teamCode}` : ''}`)
      } else {
        // League is completed / archived / free with no slug — auto-register silently.
        await db.from('registrations').insert({
          organization_id: org.id,
          league_id: team.league_id,
          user_id: user.id,
          status: 'active',
        })
      }
    } else if (canRouteToRegister) {
      // Player already has a registration but may not have paid (e.g. registered when free,
      // price was later added). Check for a paid payment record; if absent, send through
      // the registration flow which will resume at the payment step.
      const { data: payment } = await db
        .from('payments')
        .select('id')
        .eq('registration_id', existingReg.id)
        .eq('status', 'paid')
        .maybeSingle()

      if (!payment) {
        redirect(`/register/${leagueSlug!}${teamCode ? `?code=${teamCode}` : ''}`)
      }
    }
  }

  redirect(`/teams/${invite.team_id}`)
}

// ─── Resend invite ────────────────────────────────────────────────────────────

export async function resendTeamInvite(inviteId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  // Load the invite
  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, team_id, invited_email, role, token, invited_by, expires_at')
    .eq('id', inviteId)
    .eq('organization_id', org.id)
    .eq('status', 'pending')
    .single()

  if (!invite) return { error: 'Invite not found or already accepted' }

  // Verify caller is captain/coach or org admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    db.from('team_members').select('role')
      .eq('team_id', invite.team_id)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .single(),
    db.from('org_members').select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single(),
  ])

  const isTeamManager = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isTeamManager && !isOrgAdmin) return { error: 'Not authorized' }

  // Extend expiry if expired (30 days from now)
  const nowMs = Date.now()
  const expiresMs = new Date(invite.expires_at).getTime()
  let token = invite.token
  if (expiresMs < nowMs) {
    const newExpiry = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: updated } = await anyDb
      .from('team_invitations')
      .update({ expires_at: newExpiry })
      .eq('id', inviteId)
      .select('token')
      .single()
    token = updated?.token ?? token
  }

  // Build URLs
  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/invite/${token}`
  const declineUrl = `${origin}/invite/${token}?action=decline`

  // Fetch team + inviter profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    (db as any).from('teams').select('name, leagues!teams_league_id_fkey(name)').eq('id', invite.team_id).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  const inviterName = inviterProfile?.full_name ?? 'A manager'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resendLeagueRow = Array.isArray((team as any)?.leagues) ? (team as any).leagues[0] : (team as any)?.leagues
  const resendLeagueName: string | null = (resendLeagueRow as { name?: string } | null)?.name ?? null
  const teamName = team?.name ?? 'your team'

  await sendEmail({
    to: invite.invited_email,
    subject: `Reminder: You've been invited to join ${teamName}${resendLeagueName ? ` — ${resendLeagueName}` : ''}`,
    html: buildTeamInviteEmail({
      teamName,
      leagueName: resendLeagueName,
      orgName: org.name,
      invitedBy: inviterName,
      role: invite.role,
      acceptUrl,
      declineUrl,
    }),
  })

  return { error: null }
}

// ─── Cancel invite (manager action) ──────────────────────────────────────────

export async function cancelTeamInvitation(inviteId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, team_id, status')
    .eq('id', inviteId)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invite not found' }
  if (invite.status !== 'pending') return { error: 'Invite is no longer pending' }

  // Verify caller is captain/coach or org admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    db.from('team_members').select('role')
      .eq('team_id', invite.team_id)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .single(),
    db.from('org_members').select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single(),
  ])

  const isTeamManager = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isTeamManager && !isOrgAdmin) return { error: 'Not authorized' }

  await anyDb.from('team_invitations').delete().eq('id', inviteId)

  revalidatePath(`/teams/${invite.team_id}`)
  return { error: null }
}

// ─── Decline invitation ───────────────────────────────────────────────────────

export async function declineTeamInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, status, invited_by, team_id, invited_email')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found' }
  if (invite.status !== 'pending') return { error: 'Invitation is no longer active' }

  await anyDb.from('team_invitations').update({ status: 'declined' }).eq('id', invite.id)

  // Mark the in-app notification as read
  await db.from('notifications')
    .update({ read: true })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('type', 'team_invite')

  // Notify the inviter
  const [{ data: profile }, { data: team }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', user.id).single(),
    db.from('teams').select('name').eq('id', invite.team_id).single(),
  ])
  const playerName = profile?.full_name ?? invite.invited_email
  const teamName = team?.name ?? 'your team'
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: invite.invited_by,
    type: 'invite_declined',
    title: `${playerName} declined your invitation`,
    body: `They won't be joining ${teamName}.`,
  })

  return { error: null }
}
