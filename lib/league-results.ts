import type { createServiceRoleClient } from '@/lib/supabase/service'

type DB = ReturnType<typeof createServiceRoleClient>

export type LeagueResultRow = {
  home_score: number | null
  away_score: number | null
  status: string
  sets: unknown
  is_forfeit: boolean | null
  forfeit_team_id: string | null
  game: {
    home_team_id: string | null
    away_team_id: string | null
    league_id: string
    status: string
    pool_id: string | null
    scheduled_at: string | null
    is_exhibition: boolean | null
  }
}

const PAGE = 1000

/**
 * Confirmed results for ONE event, with the game fields every standings fold
 * reads. Filtered by league in the database (inner join on games) — never read
 * the whole org's results and filter in JS: that grows with every season and
 * silently stops at PostgREST's 1000-row cap, which would drop games from the
 * table. Pages past the cap so a long event is still complete.
 */
export async function getLeagueConfirmedResults(db: DB, orgId: string, leagueId: string): Promise<LeagueResultRow[]> {
  const rows: LeagueResultRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('game_results')
      .select('id, home_score, away_score, status, sets, is_forfeit, forfeit_team_id, games!game_results_game_id_fkey!inner(home_team_id, away_team_id, league_id, status, pool_id, scheduled_at, is_exhibition)')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed')
      .eq('games.league_id', leagueId)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getLeagueConfirmedResults: ${error.message}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      const game = Array.isArray(r.games) ? r.games[0] : r.games
      if (game) rows.push({ ...r, game })
    }
    if (!data || data.length < PAGE) return rows
  }
}
