'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

export async function createDivision(leagueId: string, name: string) {
  if (!name.trim()) return { error: 'Name required' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  const { data: existing } = await db
    .from('divisions')
    .select('sort_order')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { error } = await db.from('divisions').insert({
    league_id: leagueId,
    organization_id: org.id,
    name: name.trim(),
    sort_order: nextOrder,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/divisions`)
  return { error: null }
}

export async function deleteDivision(divisionId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // Unassign all teams first
  await db
    .from('teams')
    .update({ division_id: null })
    .eq('division_id', divisionId)
    .eq('organization_id', org.id)

  const { error } = await db
    .from('divisions')
    .delete()
    .eq('id', divisionId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/divisions`)
  return { error: null }
}

export async function setTeamDivision(
  teamId: string,
  leagueId: string,
  divisionId: string | null
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  const { error } = await db
    .from('teams')
    .update({ division_id: divisionId })
    .eq('id', teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/divisions`)
  return { error: null }
}
