'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
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

// ─── Captain: invite player by email ─────────────────────────────────────────

const invitePlayerSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
})

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
