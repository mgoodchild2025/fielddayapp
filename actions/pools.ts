'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

export async function createPool(leagueId: string, name: string) {
  if (!name.trim()) return { error: 'Name required' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('pools')
    .select('sort_order')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('pools').insert({
    league_id: leagueId,
    organization_id: org.id,
    name: name.trim(),
    sort_order: nextOrder,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/pools`)
  return { error: null }
}

export async function deletePool(poolId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()

  // Unassign all teams and games first
  await supabase
    .from('teams')
    .update({ pool_id: null } as never)
    .eq('pool_id' as never, poolId)
    .eq('organization_id', org.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('games')
    .update({ pool_id: null })
    .eq('pool_id', poolId)
    .eq('organization_id', org.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pools')
    .delete()
    .eq('id', poolId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/pools`)
  return { error: null }
}

export async function setTeamPool(
  teamId: string,
  leagueId: string,
  poolId: string | null
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('teams')
    .update({ pool_id: poolId } as never)
    .eq('id', teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/pools`)
  return { error: null }
}

export async function generatePoolSchedule(input: {
  poolId: string
  leagueId: string
  startDate: string
  gameTime: string
  daysBetweenRounds: number
  courts: number
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()

  // Fetch teams in this pool
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('pool_id' as never, input.poolId)
    .eq('organization_id', org.id)
    .eq('status', 'active')

  if (!teams || teams.length < 2)
    return { error: 'Need at least 2 teams in the pool', count: 0 }

  const { generateRoundRobin, assignDates } = await import('@/lib/scheduler')
  const fixtures = generateRoundRobin(teams)
  const scheduled = assignDates(fixtures, {
    startDate: input.startDate,
    gameTime: input.gameTime,
    daysBetweenRounds: input.daysBetweenRounds,
    courts: input.courts,
  })

  const games = scheduled.map((g) => ({
    organization_id: org.id,
    league_id: input.leagueId,
    pool_id: input.poolId,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    scheduled_at: g.scheduledAt,
    week_number: g.weekNumber,
    court: g.court,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('games').insert(games)
  if (error) return { error: error.message, count: 0 }

  revalidatePath(`/admin/events/${input.leagueId}/pools`)
  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  return { error: null, count: games.length }
}
