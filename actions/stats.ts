'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatDef {
  key: string
  label: string
  data_type: 'integer' | 'decimal' | 'boolean'
  display_order: number
}

export interface PlayerStatRow {
  userId: string
  statKey: string
  value: number
}

// season totals: userId → statKey → total
export type SeasonTotals = Record<string, Record<string, number>>

// per-game stats: userId → statKey → value
export type GameStats = Record<string, Record<string, number>>

// ── getStatDefinitions ────────────────────────────────────────────────────────
// Returns org-specific definitions if any exist for the sport,
// otherwise falls back to platform defaults (organization_id = null).

export async function getStatDefinitions(orgId: string, sport: string): Promise<StatDef[]> {
  const supabase = createServiceRoleClient()

  // Check for org-specific overrides first
  const { data: orgDefs } = await supabase
    .from('stat_definitions')
    .select('key, label, data_type, display_order')
    .eq('organization_id', orgId)
    .eq('sport', sport)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (orgDefs && orgDefs.length > 0) {
    return orgDefs as StatDef[]
  }

  // Fall back to platform defaults
  const { data: defaults } = await supabase
    .from('stat_definitions')
    .select('key, label, data_type, display_order')
    .is('organization_id', null)
    .eq('sport', sport)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  return (defaults ?? []) as StatDef[]
}

// ── getGameStats ──────────────────────────────────────────────────────────────
// Returns a nested map of userId → statKey → value for a single game.

export async function getGameStats(gameId: string, orgId: string): Promise<GameStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('player_game_stats')
    .select('user_id, stat_key, value')
    .eq('game_id', gameId)
    .eq('organization_id', orgId)

  const result: GameStats = {}
  for (const row of (data ?? []) as Array<{ user_id: string; stat_key: string; value: number }>) {
    if (!result[row.user_id]) result[row.user_id] = {}
    result[row.user_id][row.stat_key] = Number(row.value)
  }
  return result
}

// ── getLeagueStatTotals ───────────────────────────────────────────────────────
// Aggregates season totals for a league: userId → statKey → sum.

export async function getLeagueStatTotals(leagueId: string, orgId: string): Promise<SeasonTotals> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('player_game_stats')
    .select('user_id, stat_key, value')
    .eq('league_id', leagueId)
    .eq('organization_id', orgId)

  const result: SeasonTotals = {}
  for (const row of (data ?? []) as Array<{ user_id: string; stat_key: string; value: number }>) {
    if (!result[row.user_id]) result[row.user_id] = {}
    result[row.user_id][row.stat_key] =
      (result[row.user_id][row.stat_key] ?? 0) + Number(row.value)
  }
  return result
}

// ── submitGameStats ───────────────────────────────────────────────────────────
// Upserts all stat rows for one team in one game.
// Validates caller is org/league admin, league organizer, or captain of teamId.

const submitSchema = z.object({
  gameId:   z.string().uuid(),
  leagueId: z.string().uuid(),
  teamId:   z.string().uuid(),
  stats: z.array(z.object({
    userId:  z.string().uuid(),
    statKey: z.string().min(1),
    value:   z.number().min(0),
  })),
})

export async function submitGameStats(
  input: z.infer<typeof submitSchema>
): Promise<{ error: string | null }> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Authorisation: must be org/league admin, league organizer, or team captain
  const [{ data: adminMember }, { data: captainship }, { data: organizer }] = await Promise.all([
    supabase
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .in('role', ['org_admin', 'league_admin'])
      .single(),
    supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('team_id', parsed.data.teamId)
      .eq('role', 'captain')
      .single(),
    supabase
      .from('league_organizers')
      .select('id')
      .eq('league_id', parsed.data.leagueId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single(),
  ])

  if (!adminMember && !captainship && !organizer) {
    return { error: 'Only admins, organizers, or team captains can submit stats' }
  }

  // Verify game belongs to the org
  const { data: game } = await supabase
    .from('games')
    .select('id, league_id')
    .eq('id', parsed.data.gameId)
    .eq('organization_id', org.id)
    .single()

  if (!game) return { error: 'Game not found' }

  // Filter out zero-value rows to keep the table lean — only store non-zero stats
  const nonZeroStats = parsed.data.stats.filter(s => s.value > 0)

  if (nonZeroStats.length === 0) {
    // Nothing to save (or all zeros cleared) — delete any existing rows for this team/game
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = createServiceRoleClient() as any
    const userIds = parsed.data.stats.map(s => s.userId)
    await service
      .from('player_game_stats')
      .delete()
      .eq('game_id', parsed.data.gameId)
      .eq('team_id', parsed.data.teamId)
      .in('user_id', userIds)

    revalidatePath('/events/[slug]', 'page')
    return { error: null }
  }

  const rows = nonZeroStats.map(s => ({
    organization_id: org.id,
    league_id: parsed.data.leagueId,
    game_id: parsed.data.gameId,
    team_id: parsed.data.teamId,
    user_id: s.userId,
    stat_key: s.statKey,
    value: s.value,
    entered_by: user.id,
    updated_at: new Date().toISOString(),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceRoleClient() as any
  const { error } = await service
    .from('player_game_stats')
    .upsert(rows, { onConflict: 'game_id,user_id,stat_key' })

  if (error) return { error: error.message }

  revalidatePath('/events/[slug]', 'page')
  revalidatePath(`/admin/events/${parsed.data.leagueId}/stats`)
  return { error: null }
}

// ── getGameStatsForEntry ──────────────────────────────────────────────────────
// Loads everything the GameStatsSheet needs in one round-trip.
// Used by CaptainStatsEntry to lazy-load data only when the sheet is opened.

export interface GameStatsEntryData {
  leagueId: string
  sport: string
  statDefs: StatDef[]
  homeTeam: { id: string; name: string; members: Array<{ userId: string; name: string; avatarUrl: string | null }> }
  awayTeam: { id: string; name: string; members: Array<{ userId: string; name: string; avatarUrl: string | null }> }
  existingStats: GameStats
}

export async function getGameStatsForEntry(gameId: string): Promise<{ data: GameStatsEntryData | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const service = createServiceRoleClient()

  // Fetch game + league sport
  const { data: game } = await service
    .from('games')
    .select(`
      id, league_id,
      home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(sport)
    `)
    .eq('id', gameId)
    .eq('organization_id', org.id)
    .single()

  if (!game) return { data: null, error: 'Game not found' }

  const leagueArr = Array.isArray(game.league) ? game.league : [game.league]
  const sport: string = leagueArr[0]?.sport ?? ''
  const homeTeamRaw = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
  const awayTeamRaw = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
  const homeTeamId = game.home_team_id ?? ''
  const awayTeamId = game.away_team_id ?? ''

  const [statDefs, existingStats, { data: membersRaw }] = await Promise.all([
    getStatDefinitions(org.id, sport),
    getGameStats(gameId, org.id),
    service
      .from('team_members')
      .select('team_id, user_id, profile:profiles!team_members_user_id_fkey(full_name, avatar_url)')
      .in('team_id', [homeTeamId, awayTeamId].filter(Boolean)),
  ])

  function buildMembers(teamId: string): Array<{ userId: string; name: string; avatarUrl: string | null }> {
    return (membersRaw ?? [])
      .filter(m => m.team_id === teamId)
      .map(m => {
        const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
        return {
          userId: m.user_id ?? '',
          name: (p as { full_name?: string | null } | null)?.full_name ?? 'Unknown',
          avatarUrl: (p as { avatar_url?: string | null } | null)?.avatar_url ?? null,
        }
      })
  }

  return {
    data: {
      leagueId: game.league_id,
      sport,
      statDefs,
      homeTeam: { id: homeTeamId, name: homeTeamRaw?.name ?? 'Home', members: buildMembers(homeTeamId) },
      awayTeam: { id: awayTeamId, name: awayTeamRaw?.name ?? 'Away', members: buildMembers(awayTeamId) },
      existingStats,
    },
    error: null,
  }
}

// ── updateStatsPublic ─────────────────────────────────────────────────────────
// Org admins toggle public visibility of stats for a league.

export async function updateStatsPublic(
  leagueId: string,
  statsPublic: boolean
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!adminMember) return { error: 'Admin access required' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('leagues')
    .update({ stats_public: statsPublic })
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}
