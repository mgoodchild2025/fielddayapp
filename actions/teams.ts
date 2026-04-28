'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

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

  revalidatePath(`/admin/leagues/${parsed.data.leagueId}/teams`)
  return { data: team, error: null }
}

// ─── Admin: create team ───────────────────────────────────────────────────────

const adminCreateTeamSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().min(2),
  color: z.string().optional(),
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

  revalidatePath(`/admin/leagues/${parsed.data.leagueId}/teams`)
  return { data: team, error: null }
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
  revalidatePath('/admin/leagues')
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

  revalidatePath(`/admin/leagues/${leagueId}/teams`)
  return { error: null }
}

// ─── Delete an entire team ────────────────────────────────────────────────────

export async function deleteTeam(teamId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Remove all members first (in case no cascade is set)
  await supabase.from('team_members').delete().eq('team_id', teamId).eq('organization_id', org.id)

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/leagues/${leagueId}/teams`)
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

  if (profile) {
    // User exists — add as active member

    // Ensure org membership
    await supabase.from('org_members').upsert({
      organization_id: org.id,
      user_id: profile.id,
      role: parsed.data.role === 'captain' ? 'captain' : 'player',
      status: 'active',
    }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

    // Add to team (upsert in case they're already a member — updates role)
    const { error } = await supabase.from('team_members').upsert({
      organization_id: org.id,
      team_id: parsed.data.teamId,
      user_id: profile.id,
      invited_email: parsed.data.email,
      role: parsed.data.role,
      status: 'active',
    }, { onConflict: 'team_id,user_id' })

    if (error) return { data: null, error: error.message, invited: false }

    revalidatePath(`/admin/leagues/${parsed.data.leagueId}/teams`)
    return { data: null, error: null, invited: false }
  }

  // No account yet — store as an invite; links automatically when they sign up
  const { error } = await supabase.from('team_members').insert({
    organization_id: org.id,
    team_id: parsed.data.teamId,
    user_id: null,
    invited_email: parsed.data.email,
    role: parsed.data.role,
    status: 'invited',
  })

  if (error) {
    if (error.code === '23505') return { data: null, error: `${parsed.data.email} has already been invited to this team`, invited: false }
    return { data: null, error: error.message, invited: false }
  }

  revalidatePath(`/admin/leagues/${parsed.data.leagueId}/teams`)
  return { data: null, error: null, invited: true }
}

// ─── Request to join a team ──────────────────────────────────────────────────

export async function requestToJoinTeam(teamId: string, message?: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

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

  const { error } = await supabase
    .from('team_join_requests')
    .upsert({
      team_id: teamId,
      organization_id: org.id,
      user_id: user.id,
      message: message ?? null,
      status: 'pending',
    }, { onConflict: 'team_id,user_id' })

  if (error) return { error: error.message }

  // Notify the team captain
  const { data: captain } = await supabase
    .from('team_members')
    .select('user_id, profiles!team_members_user_id_fkey(full_name)')
    .eq('team_id', teamId)
    .eq('role', 'captain')
    .single()

  const requesterProfile = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (captain?.user_id) {
    const requesterName = requesterProfile.data?.full_name ?? 'Someone'
    await supabase.from('notifications').insert({
      organization_id: org.id,
      user_id: captain.user_id,
      type: 'join_request',
      title: `New join request`,
      body: `${requesterName} wants to join your team.`,
      data: { team_id: teamId, user_id: user.id },
    })
  }

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
    callerMember?.role === 'captain' ||
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

  // Notify the requester
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: req.user_id,
    type: 'join_approved',
    title: 'Join request approved!',
    body: 'Your request to join the team has been approved.',
  })

  if (team?.league_id) revalidatePath(`/admin/leagues/${team.league_id}/teams`)
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

  // Notify the requester
  await db.from('notifications').insert({
    organization_id: org.id,
    user_id: req.user_id,
    type: 'join_rejected',
    title: 'Join request declined',
    body: 'Your request to join the team was not approved. Contact the captain for more info.',
  })

  if (team?.league_id) revalidatePath(`/admin/leagues/${team.league_id}/teams`)
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

  revalidatePath(`/admin/leagues/${leagueId}/teams`)
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

  const { error, org, db } = await requireCaptainOrCoach(parsed.data.teamId)
  if (error) return { error, invited: false }

  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: e } = await (db as any).from('team_members').insert({
    organization_id: org.id,
    team_id: parsed.data.teamId,
    user_id: profile?.id ?? null,
    invited_email: parsed.data.email,
    role: parsed.data.role,
    status: profile ? 'active' : 'invited',
  })

  if (e) return { error: e.message, invited: false }

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { error: null, invited: !profile }
}
