'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

async function requireOrgAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' as const, org: null as never, db: null as never }

  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'org_admin') {
    return { error: 'Unauthorized' as const, org: null as never, db: null as never }
  }
  return { error: null as null, org, db }
}

const detailsSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']).optional().nullable(),
  t_shirt_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  how_did_you_hear: z.string().optional().nullable(),
})

export async function updatePlayerDetails(
  userId: string,
  input: z.infer<typeof detailsSchema>
) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const { full_name, phone, ...details } = parsed.data

  const { error: profileErr } = await db
    .from('profiles')
    .update({ full_name, phone: phone || null })
    .eq('id', userId)
  if (profileErr) return { error: profileErr.message }

  const { error: detErr } = await db.from('player_details').upsert(
    { organization_id: org.id, user_id: userId, ...details },
    { onConflict: 'organization_id,user_id' }
  )
  if (detErr) return { error: detErr.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function updateOrgMemberRole(
  userId: string,
  role: 'org_admin' | 'league_admin' | 'captain' | 'player'
) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db
    .from('org_members')
    .update({ role })
    .eq('user_id', userId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function addPlayerToLeague(userId: string, leagueId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { data: existing } = await db
    .from('registrations')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return { error: 'Player is already registered for this league' }

  const { error: e } = await db.from('registrations').insert({
    organization_id: org.id,
    league_id: leagueId,
    user_id: userId,
    status: 'active',
  })
  if (e) return { error: e.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function removePlayerFromLeague(registrationId: string, userId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db
    .from('registrations')
    .delete()
    .eq('id', registrationId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function addPlayerToTeam(userId: string, teamId: string, leagueId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db.from('team_members').insert({
    organization_id: org.id,
    team_id: teamId,
    user_id: userId,
    role: 'player',
    status: 'active',
  })
  if (e) return { error: e.message }

  await db
    .from('registrations')
    .update({ team_id: teamId })
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('organization_id', org.id)

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function removePlayerFromTeam(teamMemberId: string, userId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db
    .from('team_members')
    .delete()
    .eq('id', teamMemberId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function setTeamMemberRole(
  teamMemberId: string,
  role: 'captain' | 'player' | 'sub',
  userId: string
) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db
    .from('team_members')
    .update({ role })
    .eq('id', teamMemberId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath(`/admin/players/${userId}`)
  return { error: null }
}

export async function removePlayerFromOrg(userId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  // Remove team memberships within this org
  await db.from('team_members').delete().eq('user_id', userId).eq('organization_id', org.id)
  // Remove registrations within this org
  await db.from('registrations').delete().eq('user_id', userId).eq('organization_id', org.id)
  // Remove the org membership itself
  const { error: e } = await db
    .from('org_members')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath('/admin/players')
  return { error: null }
}

export async function sendPlayerNotification(userId: string, title: string, body: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const { error: e } = await db.from('notifications').insert({
    organization_id: org.id,
    user_id: userId,
    type: 'admin_message',
    title,
    body: body || null,
  })
  if (e) return { error: e.message }

  return { error: null }
}
