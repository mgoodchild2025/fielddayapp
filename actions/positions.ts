'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

export interface SportPosition {
  id: string
  sport: string
  name: string
  display_order: number
  organization_id: string | null
}

export async function getPositionsForSport(orgId: string, sport: string): Promise<string[]> {
  if (!sport) return []
  const db = createServiceRoleClient()

  // Prefer org-specific rows; fall back to platform defaults
  const { data: orgRows } = await db
    .from('sport_positions')
    .select('name, display_order')
    .eq('organization_id', orgId)
    .eq('sport', sport)
    .order('display_order')

  if (orgRows && orgRows.length > 0) {
    return orgRows.map(r => r.name)
  }

  const { data: defaults } = await db
    .from('sport_positions')
    .select('name, display_order')
    .is('organization_id', null)
    .eq('sport', sport)
    .order('display_order')

  return (defaults ?? []).map(r => r.name)
}

export async function getOrgPositionsForSport(sport: string): Promise<{ positions: SportPosition[]; isCustom: boolean }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { data: orgRows } = await db
    .from('sport_positions')
    .select('id, sport, name, display_order, organization_id')
    .eq('organization_id', org.id)
    .eq('sport', sport)
    .order('display_order')

  if (orgRows && orgRows.length > 0) {
    return { positions: orgRows, isCustom: true }
  }

  const { data: defaults } = await db
    .from('sport_positions')
    .select('id, sport, name, display_order, organization_id')
    .is('organization_id', null)
    .eq('sport', sport)
    .order('display_order')

  return { positions: defaults ?? [], isCustom: false }
}

const addOrgPositionSchema = z.object({
  sport: z.string().min(1),
  name: z.string().min(1).max(100),
})

export async function addOrgPosition(input: z.infer<typeof addOrgPositionSchema>) {
  const parsed = addOrgPositionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: member } = await db.from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Not authorized' }
  }

  // If org has no custom positions yet, clone platform defaults first (minus the new sport entry)
  // so the org row set is complete before we add the new one.
  const { data: existing } = await db.from('sport_positions').select('id')
    .eq('organization_id', org.id).eq('sport', parsed.data.sport).limit(1)

  if (!existing || existing.length === 0) {
    const { data: defaults } = await db.from('sport_positions').select('sport, name, display_order')
      .is('organization_id', null).eq('sport', parsed.data.sport).order('display_order')

    if (defaults && defaults.length > 0) {
      await db.from('sport_positions').insert(
        defaults.map(d => ({ ...d, organization_id: org.id }))
      )
    }
  }

  // Find max display_order for this org+sport
  const { data: maxRow } = await db.from('sport_positions').select('display_order')
    .eq('organization_id', org.id).eq('sport', parsed.data.sport)
    .order('display_order', { ascending: false }).limit(1).single()

  const nextOrder = (maxRow?.display_order ?? 0) + 1

  const { error } = await db.from('sport_positions').insert({
    organization_id: org.id,
    sport: parsed.data.sport,
    name: parsed.data.name,
    display_order: nextOrder,
  })

  if (error) {
    if (error.code === '23505') return { error: 'That position already exists' }
    return { error: error.message }
  }

  revalidatePath('/admin/settings/positions')
  return { error: null }
}

export async function removeOrgPosition(positionId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: member } = await db.from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Not authorized' }
  }

  const { error } = await db.from('sport_positions').delete()
    .eq('id', positionId)
    .eq('organization_id', org.id) // safety: can only delete own org's rows

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/positions')
  return { error: null }
}

export async function resetOrgPositions(sport: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: member } = await db.from('org_members').select('role')
    .eq('organization_id', org.id).eq('user_id', user.id).single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Not authorized' }
  }

  const { error } = await db.from('sport_positions').delete()
    .eq('organization_id', org.id)
    .eq('sport', sport)

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/positions')
  return { error: null }
}

const setTeamMemberPositionSchema = z.object({
  memberId: z.string().uuid(),
  teamId: z.string().uuid(),
  position: z.string(),
})

export async function setTeamMemberPosition(input: z.infer<typeof setTeamMemberPositionSchema>) {
  const parsed = setTeamMemberPositionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()

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

  const { error } = await db.from('team_members')
    .update({ position: parsed.data.position || null })
    .eq('id', parsed.data.memberId)
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  return { error: null }
}
