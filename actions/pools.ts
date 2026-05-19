'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

export async function createPool(leagueId: string, name: string) {
  if (!name.trim()) return { error: 'Name required' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (db as any)
    .from('pools')
    .select('sort_order')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('pools').insert({
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

  const db = createServiceRoleClient()

  // Unassign all teams and games first
  await db
    .from('teams')
    .update({ pool_id: null } as never)
    .eq('pool_id' as never, poolId)
    .eq('organization_id', org.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('games')
    .update({ pool_id: null })
    .eq('pool_id', poolId)
    .eq('organization_id', org.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
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

  const db = createServiceRoleClient()

  // When assigning to a pool, place the team at the end
  let poolSortOrder = 0
  if (poolId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('teams')
      .select('id')
      .eq('pool_id', poolId)
      .eq('organization_id', org.id)
    poolSortOrder = (existing?.length ?? 0)
  }

  const { error } = await db
    .from('teams')
    .update({ pool_id: poolId, pool_sort_order: poolId ? poolSortOrder : 0 } as never)
    .eq('id', teamId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/pools`)
  return { error: null }
}

export async function reorderTeamInPool(
  leagueId: string,
  orderedTeamIds: string[]
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  await Promise.all(
    orderedTeamIds.map((id, index) =>
      db.from('teams')
        .update({ pool_sort_order: index } as never)
        .eq('id', id)
        .eq('organization_id', org.id)
    )
  )

  revalidatePath(`/admin/events/${leagueId}/pools`)
  return { error: null }
}

export async function seedPoolsFromStandings(
  leagueId: string,
  pools: { name: string; teamIds: string[] }[]
): Promise<{ error: string | null }> {
  if (!pools.length) return { error: 'At least one pool required' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // Delete all existing pools for this league (cascades team/game pool_id nullification)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingPools } = await (db as any)
    .from('pools')
    .select('id')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)

  for (const p of (existingPools ?? [])) {
    // Unassign teams and games first
    await db.from('teams').update({ pool_id: null } as never).eq('pool_id' as never, p.id).eq('organization_id', org.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('games').update({ pool_id: null }).eq('pool_id', p.id).eq('organization_id', org.id)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('pools').delete().eq('league_id', leagueId).eq('organization_id', org.id)

  // Insert new pools in order
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newPool, error: insertError } = await (db as any)
      .from('pools')
      .insert({ league_id: leagueId, organization_id: org.id, name: pool.name.trim(), sort_order: i })
      .select('id')
      .single()

    if (insertError) return { error: insertError.message }

    // Assign teams to this pool with sort order based on standings position
    for (let j = 0; j < pool.teamIds.length; j++) {
      const { error: teamError } = await db
        .from('teams')
        .update({ pool_id: newPool.id, pool_sort_order: j } as never)
        .eq('id', pool.teamIds[j])
        .eq('league_id', leagueId)
        .eq('organization_id', org.id)
      if (teamError) return { error: teamError.message }
    }
  }

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
  gameDurationMinutes?: number
  maxRounds?: number
  courtNames?: string[]
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  const { data: branding } = await db
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone: string = (branding as { timezone?: string | null } | null)?.timezone ?? 'America/Toronto'

  // Fetch teams in this pool
  const { data: teams } = await db
    .from('teams')
    .select('id, name')
    .eq('pool_id' as never, input.poolId)
    .eq('organization_id', org.id)
    .eq('status', 'active')

  if (!teams || teams.length < 2)
    return { error: 'Need at least 2 teams in the pool', count: 0 }

  const { generateRoundRobin, assignDates } = await import('@/lib/scheduler')
  let fixtures = generateRoundRobin(teams)
  if (input.maxRounds && input.maxRounds > 0) {
    fixtures = fixtures.filter((f) => f.round <= input.maxRounds!)
  }
  const scheduled = assignDates(fixtures, {
    startDate: input.startDate,
    gameTime: input.gameTime,
    daysBetweenRounds: input.daysBetweenRounds,
    courts: input.courts,
    gameDurationMinutes: input.gameDurationMinutes,
    timezone,
    courtNames: input.courtNames,
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
  const { error } = await (db as any).from('games').insert(games)
  if (error) return { error: error.message, count: 0 }

  revalidatePath(`/admin/events/${input.leagueId}/pools`)
  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  return { error: null, count: games.length }
}
