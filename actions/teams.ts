'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { sendEmail, buildJoinRequestEmail, buildJoinApprovedEmail, buildJoinDeclinedEmail, buildCaptainAssignedEmail, buildTeamAddedEmail } from '@/lib/email'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I

function generateTeamCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
}

// ─── Create team (player self-serve) ─────────────────────────────────────────

const createTeamSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().min(2),
  color: z.string().optional(),
})

export async function createTeam(input: z.infer<typeof createTeamSchema>) {
  const parsed = createTeamSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // ── Capacity check (per-team payment events) ──────────────────────────────
  const { data: leagueCap } = await supabase
    .from('leagues')
    .select('payment_mode, max_teams')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .single()

  if (leagueCap?.payment_mode === 'per_team' && leagueCap.max_teams) {
    const { count } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', parsed.data.leagueId)
      .eq('organization_id', org.id)
      .eq('status', 'active')
    if ((count ?? 0) >= leagueCap.max_teams) {
      return { data: null, error: 'EVENT_FULL' }
    }
  }

  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      team_code: generateTeamCode(),
    })
    .select('id, team_code')
    .single()

  if (error) return { data: null, error: error.message }

  // Add creator as captain
  await supabase.from('team_members').insert({
    organization_id: org.id,
    team_id: team.id,
    user_id: user.id,
    role: 'captain',
    status: 'active',
  })

  // Upgrade org member role from player → captain
  await supabase
    .from('org_members')
    .update({ role: 'captain' })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('role', 'player')

  revalidatePath(`/admin/events/${parsed.data.leagueId}/teams`)
  return { data: team, error: null }
}

// ─── Helper: notify a newly-assigned captain ─────────────────────────────────

async function notifyCaptainAssigned({
  db,
  org,
  captainUserId,
  teamId,
  teamName,
  leagueId,
  headersList,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  org: { id: string; name: string }
  captainUserId: string
  teamId: string
  teamName: string
  leagueId: string
  headersList: Awaited<ReturnType<typeof import('next/headers')['headers']>>
}) {
  const [{ data: captainProfile }, { data: leagueRow }] = await Promise.all([
    db.from('profiles').select('email, full_name').eq('id', captainUserId).single(),
    db.from('leagues').select('name').eq('id', leagueId).single(),
  ])

  if (!captainProfile?.email) return

  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const teamUrl = `${proto}://${host}/teams/${teamId}`
  const leagueName = leagueRow?.name ?? ''

  // In-app notification
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: captainUserId,
    type: 'captain_assigned',
    title: `You're the captain of ${teamName}`,
    body: `You've been named captain of ${teamName} for ${leagueName}. Tap to manage your roster.`,
    data: { team_url: teamUrl },
  })

  // Email
  await sendEmail({
    to: captainProfile.email,
    subject: `You're the captain of ${teamName}`,
    html: buildCaptainAssignedEmail({
      teamName,
      orgName: org.name,
      leagueName,
      teamUrl,
    }),
  })
}

// ─── Admin: create team ───────────────────────────────────────────────────────

const adminCreateTeamSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().min(2),
  color: z.string().optional(),
  captainUserId: z.string().uuid().optional(),
  /** Slot label to map (e.g. "Team 3") — replaces null-team games with this team */
  slotLabel: z.string().optional(),
})

export async function adminCreateTeam(input: z.infer<typeof adminCreateTeamSchema>) {
  const parsed = adminCreateTeamSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      team_code: generateTeamCode(),
    })
    .select('id, team_code')
    .single()

  if (error) return { data: null, error: error.message }

  const db = createServiceRoleClient()

  // Map template slot → real team (update matching games)
  if (parsed.data.slotLabel) {
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('games')
        .update({ home_team_id: team.id, home_team_label: null })
        .eq('league_id', parsed.data.leagueId)
        .eq('organization_id', org.id)
        .is('home_team_id', null)
        .eq('home_team_label', parsed.data.slotLabel),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('games')
        .update({ away_team_id: team.id, away_team_label: null })
        .eq('league_id', parsed.data.leagueId)
        .eq('organization_id', org.id)
        .is('away_team_id', null)
        .eq('away_team_label', parsed.data.slotLabel),
    ])
    revalidatePath(`/admin/events/${parsed.data.leagueId}/schedule`)
  }

  // Assign captain immediately if provided
  if (parsed.data.captainUserId) {
    await db.from('team_members').insert({
      organization_id: org.id,
      team_id: team.id,
      user_id: parsed.data.captainUserId,
      role: 'captain',
      status: 'active',
    })
    // Upgrade org membership role to captain
    await db
      .from('org_members')
      .update({ role: 'captain' })
      .eq('organization_id', org.id)
      .eq('user_id', parsed.data.captainUserId)
      .eq('role', 'player')

    // Notify the captain
    await notifyCaptainAssigned({
      db,
      org,
      captainUserId: parsed.data.captainUserId,
      teamId: team.id,
      teamName: parsed.data.name,
      leagueId: parsed.data.leagueId,
      headersList,
    })
  }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/teams`)
  return { data: team, error: null }
}

// ─── Admin: assign a new captain to an existing team ─────────────────────────

export async function adminSetCaptain(memberId: string, teamId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Verify caller is org/league admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: orgMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!orgMember || !['org_admin', 'league_admin'].includes(orgMember.role)) {
    return { error: 'Forbidden' }
  }

  // Demote any existing captains on this team to player
  await db
    .from('team_members')
    .update({ role: 'player' })
    .eq('team_id', teamId)
    .eq('organization_id', org.id)
    .eq('role', 'captain')

  // Promote the target member
  const { data: promoted, error: promoteError } = await db
    .from('team_members')
    .update({ role: 'captain' })
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('organization_id', org.id)
    .select('user_id')
    .single()

  if (promoteError) return { error: promoteError.message }

  // Upgrade org membership role
  if (promoted?.user_id) {
    await db
      .from('org_members')
      .update({ role: 'captain' })
      .eq('organization_id', org.id)
      .eq('user_id', promoted.user_id)
      .eq('role', 'player')

    // Fetch team name for notification
    const { data: teamRow } = await db.from('teams').select('name, league_id').eq('id', teamId).single()
    if (teamRow) {
      await notifyCaptainAssigned({
        db,
        org,
        captainUserId: promoted.user_id,
        teamId,
        teamName: teamRow.name,
        leagueId,
        headersList,
      })
    }
  }

  revalidatePath(`/admin/events/${leagueId}/teams`)
  revalidatePath(`/teams/${teamId}`)
  return { error: null }
}

// ─── Regenerate team code ─────────────────────────────────────────────────────

export async function regenerateTeamCode(teamId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('teams')
    .update({ team_code: generateTeamCode() })
    .eq('id', teamId)
    .eq('organization_id', org.id)
    .select('team_code')
    .single()

  if (error) return { data: null, error: error.message }
  revalidatePath('/admin/events')
  return { data, error: null }
}

// ─── Join team by code (player during or after registration) ──────────────────

export async function joinTeamByCode(teamCode: string) {
  const code = teamCode.trim().toUpperCase()
  if (!code) return { data: null, error: 'No code provided' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Look up team by code within this org
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, league_id, organization_id')
    .eq('team_code', code)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .single()

  if (!team) return { data: null, error: 'Team code not found. Check the code and try again.' }

  // ── Team size capacity check ──────────────────────────────────────────────
  const { data: leagueForSize } = await supabase
    .from('leagues')
    .select('max_team_size')
    .eq('id', team.league_id)
    .single()

  if (leagueForSize?.max_team_size) {
    const { count: memberCount } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('status', 'active')
    if ((memberCount ?? 0) >= leagueForSize.max_team_size) {
      return { data: null, error: `This team is full (max ${leagueForSize.max_team_size} players).` }
    }
  }

  // Ensure org membership
  await supabase.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  // Add to team — upsert so re-entering the code is harmless
  const { error } = await supabase.from('team_members').upsert({
    organization_id: org.id,
    team_id: team.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'team_id,user_id' })

  if (error) return { data: null, error: error.message }

  // Also link any pending invite for this user's email
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (profile?.email) {
    await supabase
      .from('team_members')
      .update({ user_id: user.id, status: 'active' })
      .eq('team_id', team.id)
      .eq('invited_email', profile.email)
      .is('user_id', null)
  }

  revalidatePath('/dashboard')
  return { data: { teamId: team.id, teamName: team.name }, error: null }
}

// ─── Validate a team code (no side effects, used for form validation) ─────────

export async function validateTeamCode(teamCode: string) {
  const code = teamCode.trim().toUpperCase()
  if (!code) return { data: null, error: 'No code provided' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('team_code', code)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .single()

  if (!team) return { data: null, error: 'Team code not found' }
  return { data: team, error: null }
}

// ─── Remove a player from a team ─────────────────────────────────────────────

export async function removeTeamMember(memberId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/teams`)
  return { error: null }
}

// ─── Delete an entire team ────────────────────────────────────────────────────

export async function deleteTeam(teamId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase.from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin']).single()
  if (!member) return { error: 'Admin access required' }

  const db = createServiceRoleClient()

  // Null out team references in bracket_matches (preserves bracket structure)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ team1_id: null, team1_seed: null })
    .eq('team1_id', teamId).eq('organization_id', org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ team2_id: null, team2_seed: null })
    .eq('team2_id', teamId).eq('organization_id', org.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('bracket_matches')
    .update({ winner_team_id: null })
    .eq('winner_team_id', teamId).eq('organization_id', org.id)

  // Null out team references in games
  await db.from('games').update({ home_team_id: null } as never)
    .eq('home_team_id', teamId).eq('organization_id', org.id)
  await db.from('games').update({ away_team_id: null } as never)
    .eq('away_team_id', teamId).eq('organization_id', org.id)

  // Delete dependent rows
  await db.from('team_members').delete().eq('team_id', teamId).eq('organization_id', org.id)
  await db.from('team_join_requests').delete().eq('team_id', teamId).eq('organization_id', org.id)

  const { error } = await db.from('teams').delete().eq('id', teamId).eq('organization_id', org.id)
  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/teams`)
  return { error: null }
}

// ─── Admin: add member by email ───────────────────────────────────────────────

const adminAddMemberSchema = z.object({
  teamId: z.string().uuid(),
  leagueId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['player', 'captain']).default('player'),
})

export async function adminAddTeamMember(input: z.infer<typeof adminAddMemberSchema>) {
  const parsed = adminAddMemberSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input', invited: false }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Look up user by email — they may not have an account yet
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .single()

  const db = createServiceRoleClient()

  if (profile) {
    // User exists — add as active member

    // Ensure org membership
    await db.from('org_members').upsert({
      organization_id: org.id,
      user_id: profile.id,
      role: parsed.data.role === 'captain' ? 'captain' : 'player',
      status: 'active',
    }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

    // Add to team (upsert in case they're already a member — updates role)
    const { error } = await db.from('team_members').upsert({
      organization_id: org.id,
      team_id: parsed.data.teamId,
      user_id: profile.id,
      invited_email: parsed.data.email,
      role: parsed.data.role,
      status: 'active',
    }, { onConflict: 'team_id,user_id' })

    if (error) return { data: null, error: error.message, invited: false }

    // Notify the player they've been added
    const [{ data: teamRow }, { data: leagueRow }] = await Promise.all([
      db.from('teams').select('name').eq('id', parsed.data.teamId).single(),
      db.from('leagues').select('name').eq('id', parsed.data.leagueId).single(),
    ])
    if (teamRow && leagueRow) {
      const host = headersList.get('host') ?? ''
      const proto = headersList.get('x-forwarded-proto') ?? 'http'
      const teamUrl = `${proto}://${host}/teams/${parsed.data.teamId}`

      // In-app notification
      await db.from('notifications').insert({
        organization_id: org.id,
        user_id: profile.id,
        type: 'team_added',
        title: `You've been added to ${teamRow.name}`,
        body: `You've been added as ${parsed.data.role} for ${leagueRow.name}.`,
        data: { team_url: teamUrl },
      })

      // Email
      await sendEmail({
        to: parsed.data.email,
        subject: `You've been added to ${teamRow.name}`,
        html: buildTeamAddedEmail({
          teamName: teamRow.name,
          orgName: org.name,
          leagueName: leagueRow.name,
          role: parsed.data.role,
          teamUrl,
        }),
      })
    }

    revalidatePath(`/admin/events/${parsed.data.leagueId}/teams`)
    return { data: null, error: null, invited: false }
  }

  // No account yet — send a proper invite via the invitations flow so they get an email with an accept link
  const { sendTeamInvite } = await import('@/actions/invitations')
  const inviteResult = await sendTeamInvite({
    teamId: parsed.data.teamId,
    email: parsed.data.email,
    role: parsed.data.role as 'captain' | 'player',
  })

  if (inviteResult.error) return { data: null, error: inviteResult.error, invited: false }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/teams`)
  return { data: null, error: null, invited: true }
}

// ─── Request to join a team ──────────────────────────────────────────────────

export async function requestToJoinTeam(teamId: string, message?: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Can't request to join if already a member
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single()

  if (existing) return { error: 'You are already on this team' }

  const { data: joinRequest, error } = await supabase
    .from('team_join_requests')
    .upsert({
      team_id: teamId,
      organization_id: org.id,
      user_id: user.id,
      message: message ?? null,
      status: 'pending',
    }, { onConflict: 'team_id,user_id' })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Fetch team (with league name) + requester profile in parallel
  const [{ data: team }, { data: requesterProfile }] = await Promise.all([
    db.from('teams').select('name, league:leagues!teams_league_id_fkey(name)').eq('id', teamId).single(),
    db.from('profiles').select('full_name, email').eq('id', user.id).single(),
  ])

  const teamName = team?.name ?? 'the team'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueRaw = (team as any)?.league
  const leagueName: string | null = leagueRaw ? (Array.isArray(leagueRaw) ? leagueRaw[0]?.name : leagueRaw.name) ?? null : null
  const playerName = requesterProfile?.full_name ?? 'A player'
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const teamUrl = `https://${org.slug}.${platformDomain}/teams/${teamId}`

  // Fetch all captains + coaches on this team
  const { data: managers } = await db
    .from('team_members')
    .select('user_id, role, profiles!team_members_user_id_fkey(full_name, email)')
    .eq('team_id', teamId)
    .in('role', ['captain', 'coach'])
    .eq('status', 'active')

  // If no managers, fall back to org admins
  let recipients: Array<{ userId: string; email: string }> = []

  if (managers && managers.length > 0) {
    recipients = managers.map((m) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return { userId: m.user_id, email: (profile as { email?: string } | null)?.email ?? '' }
    }).filter((r) => r.email)
  } else {
    const { data: orgAdmins } = await db
      .from('org_members')
      .select('user_id, profiles!org_members_user_id_fkey(email)')
      .eq('organization_id', org.id)
      .in('role', ['org_admin', 'league_admin'])
    recipients = (orgAdmins ?? []).map((a) => {
      const profile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
      return { userId: a.user_id, email: (profile as { email?: string } | null)?.email ?? '' }
    }).filter((r) => r.email)
  }

  const emailHtml = buildJoinRequestEmail({
    teamName,
    orgName: org.name,
    playerName,
    playerEmail: requesterProfile?.email ?? '',
    message: message ?? null,
    teamUrl,
  })

  await Promise.all(
    recipients.map(async (r) => {
      // In-app notification
      await db.from('notifications').insert({
        organization_id: org.id,
        user_id: r.userId,
        type: 'join_request',
        title: `${playerName} wants to join ${teamName}`,
        body: leagueName ? `Event: ${leagueName}` : null,
        data: { team_id: teamId, requester_id: user.id, request_id: joinRequest?.id },
      })
      // Email
      if (r.email) {
        await sendEmail({
          to: r.email,
          subject: `${playerName} wants to join ${teamName}`,
          html: emailHtml,
        })
      }
    })
  )

  revalidatePath('/dashboard')
  return { error: null }
}

// ─── Approve a join request ───────────────────────────────────────────────────

export async function approveJoinRequest(requestId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Use service role — RLS only allows users to read their own requests
  const { data: req } = await db
    .from('team_join_requests')
    .select('team_id, user_id, organization_id')
    .eq('id', requestId)
    .eq('organization_id', org.id)
    .single()

  if (!req) return { error: 'Request not found' }

  // Verify caller is captain of this team or org/league admin
  const { data: callerMember } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', req.team_id)
    .eq('user_id', user.id)
    .single()

  const { data: orgMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  const canApprove =
    ['captain', 'coach'].includes(callerMember?.role ?? '') ||
    ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')

  if (!canApprove) return { error: 'Unauthorized' }

  // Fetch league_id for revalidation
  const { data: team } = await db
    .from('teams')
    .select('league_id')
    .eq('id', req.team_id)
    .single()

  // Add to team
  await db.from('team_members').upsert({
    organization_id: org.id,
    team_id: req.team_id,
    user_id: req.user_id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'team_id,user_id' })

  // Ensure org membership
  await db.from('org_members').upsert({
    organization_id: org.id,
    user_id: req.user_id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  // Update request status
  await db
    .from('team_join_requests')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)

  // Fetch team name + player email for notification
  const [{ data: teamDetails }, { data: playerProfile }] = await Promise.all([
    db.from('teams').select('name').eq('id', req.team_id).single(),
    db.from('profiles').select('full_name, email').eq('id', req.user_id).single(),
  ])

  const teamName = teamDetails?.name ?? team?.league_id ? 'your team' : 'the team'
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const teamUrl = `https://${org.slug}.${platformDomain}/teams/${req.team_id}`

  // In-app notification
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: req.user_id,
    type: 'join_approved',
    title: 'Join request approved!',
    body: `Your request to join ${teamName} has been approved. Welcome to the team!`,
    data: { team_id: req.team_id },
  })

  // Email
  if (playerProfile?.email) {
    await sendEmail({
      to: playerProfile.email,
      subject: `You've been approved to join ${teamName}`,
      html: buildJoinApprovedEmail({ teamName, orgName: org.name, teamUrl }),
    })
  }

  if (team?.league_id) revalidatePath(`/admin/events/${team.league_id}/teams`)
  revalidatePath(`/teams/${req.team_id}`)
  revalidatePath('/dashboard')
  return { error: null }
}

// ─── Reject a join request ────────────────────────────────────────────────────

export async function rejectJoinRequest(requestId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Use service role — RLS only allows users to read their own requests
  const { data: req } = await db
    .from('team_join_requests')
    .select('team_id, user_id, organization_id')
    .eq('id', requestId)
    .eq('organization_id', org.id)
    .single()

  if (!req) return { error: 'Request not found' }

  // Fetch league_id for revalidation
  const { data: team } = await db
    .from('teams')
    .select('league_id')
    .eq('id', req.team_id)
    .single()

  await db
    .from('team_join_requests')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)

  // Fetch team name + player email for notification
  const [{ data: teamDetails }, { data: playerProfile }] = await Promise.all([
    db.from('teams').select('name').eq('id', req.team_id).single(),
    db.from('profiles').select('full_name, email').eq('id', req.user_id).single(),
  ])

  const teamName = teamDetails?.name ?? 'the team'

  // In-app notification
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: req.user_id,
    type: 'join_rejected',
    title: 'Join request not approved',
    body: `Your request to join ${teamName} was not approved. Contact the captain for more info.`,
    data: { team_id: req.team_id },
  })

  // Email
  if (playerProfile?.email) {
    await sendEmail({
      to: playerProfile.email,
      subject: `Your request to join ${teamName}`,
      html: buildJoinDeclinedEmail({ teamName, orgName: org.name }),
    })
  }

  if (team?.league_id) revalidatePath(`/admin/events/${team.league_id}/teams`)
  revalidatePath(`/teams/${req.team_id}`)
  revalidatePath('/dashboard')
  return { error: null }
}

// ─── Captain: invite player by email ─────────────────────────────────────────

const invitePlayerSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
})

const sendTeamMessageSchema = z.object({
  teamId: z.string().uuid(),
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
})

/**
 * Captain sends a message to all active team members.
 * Creates a notification for every active member (excluding the sender).
 */
export async function sendTeamMessage(input: z.infer<typeof sendTeamMessageSchema>) {
  const parsed = sendTeamMessageSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify sender is a captain (or org_admin)
  const { data: callerMembership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', parsed.data.teamId)
    .eq('user_id', user.id)
    .eq('organization_id', org.id)
    .single()

  const { data: orgMembership } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  const isCaptain = callerMembership?.role === 'captain'
  const isAdmin = ['org_admin', 'league_admin'].includes(orgMembership?.role ?? '')
  if (!isCaptain && !isAdmin) return { error: 'Only captains can message their team' }

  // Get team name for notification title
  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('id', parsed.data.teamId)
    .eq('organization_id', org.id)
    .single()

  // Fetch all active team members (excluding the sender)
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .neq('user_id', user.id)

  if (!members || members.length === 0) return { error: null }

  // Create a notification for each member (skip rows with null user_id)
  const notifications = members
    .filter((m): m is typeof m & { user_id: string } => m.user_id !== null)
    .map((m) => ({
      organization_id: org.id,
      user_id: m.user_id,
      type: 'team_message',
      title: `📢 ${team?.name ?? 'Your team'}: ${parsed.data.subject}`,
      body: parsed.data.body,
      read: false,
    }))

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) return { error: error.message }

  return { error: null }
}

export async function invitePlayerToTeam(input: z.infer<typeof invitePlayerSchema>) {
  const parsed = invitePlayerSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Verify requester is captain
  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', parsed.data.teamId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'captain') return { data: null, error: 'Only captains can invite players' }

  // Check if user already exists in org
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .single()

  const { error } = await supabase.from('team_members').insert({
    organization_id: org.id,
    team_id: parsed.data.teamId,
    user_id: existingProfile?.id ?? null,
    invited_email: parsed.data.email,
    role: 'player',
    status: existingProfile ? 'active' : 'invited',
  })

  if (error) return { data: null, error: error.message }

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { data: null, error: null }
}

// ─── Admin: update team details ───────────────────────────────────────────────

export async function updateTeam(
  teamId: string,
  leagueId: string,
  updates: { name?: string; color?: string | null; logo_url?: string | null }
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { error } = await db
    .from('teams')
    .update(updates)
    .eq('id', teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/teams`)
  revalidatePath(`/teams/${teamId}`)
  return { error: null }
}

// ─── Admin: upload team logo ──────────────────────────────────────────────────

export async function uploadTeamLogo(teamId: string, formData: FormData) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { url: null, error: 'File must be under 2 MB' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${org.id}/${teamId}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from('team-logos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return { url: null, error: uploadError.message }

  const { data: { publicUrl } } = db.storage.from('team-logos').getPublicUrl(path)
  return { url: publicUrl, error: null }
}

// ─── Captain / coach: manage roster ──────────────────────────────────────────

type TeamRole = 'captain' | 'coach' | 'player' | 'sub'

async function requireCaptainOrCoach(teamId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const, user: null as never, org: null as never, db: null as never }

  const db = createServiceRoleClient()

  // Allow team captain/coach OR org/league admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    db.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id)
      .eq('organization_id', org.id).eq('status', 'active').single(),
    db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single(),
  ])

  const isTeamManager = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isTeamManager && !isOrgAdmin) {
    return { error: 'Not authorized' as const, user: null as never, org: null as never, db: null as never }
  }
  return { error: null as null, user, org, db }
}

export async function captainSetMemberRole(memberId: string, teamId: string, role: TeamRole) {
  const { error, org, db } = await requireCaptainOrCoach(teamId)
  if (error) return { error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: e } = await (db as any)
    .from('team_members')
    .update({ role })
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('organization_id', org.id)

  if (e) return { error: e.message }

  revalidatePath(`/teams/${teamId}`)
  return { error: null }
}

export async function captainRemoveTeamMember(memberId: string, teamId: string) {
  const { error, org, db } = await requireCaptainOrCoach(teamId)
  if (error) return { error }

  const { error: e } = await db
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('organization_id', org.id)

  if (e) return { error: e.message }

  revalidatePath(`/teams/${teamId}`)
  return { error: null }
}

const captainAddSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['captain', 'coach', 'player', 'sub']).default('player'),
})

export async function captainAddPlayerByEmail(input: z.infer<typeof captainAddSchema>) {
  const parsed = captainAddSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input', invited: false }

  // Delegate to the invite flow — player must accept before being added
  const { sendTeamInvite } = await import('@/actions/invitations')
  const result = await sendTeamInvite({
    teamId: parsed.data.teamId,
    email: parsed.data.email,
    role: parsed.data.role,
  })

  return { error: result.error, invited: true }
}
