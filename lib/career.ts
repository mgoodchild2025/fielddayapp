import type { createServiceRoleClient } from '@/lib/supabase/service'
import { getStatDefinitions } from '@/actions/stats'
import { accumulateGameResult, isVolleyballSport, type TeamStatTotals } from '@/lib/standings'

/**
 * The career record (card flip C1): everything the back of a player's card
 * shows, assembled from tables that already exist — team_members → teams →
 * leagues for the season list, player_game_stats (denormalised by league) for
 * the stat lines, medals for the championship glyphs. Per-org throughout: a
 * player's history at one club never leaks onto their card at another.
 */

export interface CareerSeason {
  seasonLabel: string        // "2026" — the league's season start year (falls back to creation year)
  teamName: string
  leagueName: string
  sport: string
  /** Medal glyph when this team medalled in this league ("🥇" / "🥈" / "🥉" / "🏆"). */
  medal: string | null
  stats: Record<string, number>
  /** Sort key, not displayed. */
  sortDate: string
}

export interface CareerSportTable {
  sport: string
  /** Up to three columns — a hockey-card constraint, not a technical one. */
  columns: { key: string; label: string }[]
  rows: CareerSeason[]
  totals: Record<string, number>
}

export interface PlayerCareer {
  seasons: CareerSeason[]
  /** One table per sport played (most rec players have exactly one). */
  tables: CareerSportTable[]
  seasonCount: number
  /** Gold within the last year on a team the player was on — drives the foil. */
  reigningChampion?: boolean
}

const MEDAL_GLYPH: Record<string, string> = {
  gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆',
}

export interface CareerInputs {
  memberships: {
    teamId: string; teamName: string; leagueId: string; leagueName: string
    sport: string; seasonStart: string | null; createdAt: string | null
  }[]
  /** Pre-summed per league: leagueId → statKey → total. */
  statsByLeague: Map<string, Record<string, number>>
  /** leagueId:teamId → placement. */
  medalByLeagueTeam: Map<string, string>
  /** sport → its stat definitions, display order already applied. */
  statDefsBySport: Map<string, { key: string; label: string }[]>
  /** leagueId:teamId → the TEAM's confirmed W/L/T record. Fills the card back
   *  for sports that don't track individual player stats. */
  teamRecordByLeagueTeam?: Map<string, { played: number; wins: number; losses: number; ties: number }>
}

/** Pure assembly — tested. */
export function buildCareer(inputs: CareerInputs): PlayerCareer {
  const seasons: CareerSeason[] = inputs.memberships.map((m) => {
    const date = m.seasonStart ?? m.createdAt ?? ''
    const placement = inputs.medalByLeagueTeam.get(`${m.leagueId}:${m.teamId}`)
    const rec = inputs.teamRecordByLeagueTeam?.get(`${m.leagueId}:${m.teamId}`)
    return {
      seasonLabel: date ? String(new Date(date).getFullYear()) : '—',
      teamName: m.teamName,
      leagueName: m.leagueName,
      sport: m.sport || 'other',
      medal: placement ? (MEDAL_GLYPH[placement] ?? null) : null,
      // Reserved __-prefixed keys carry the TEAM record so no-player-stat
      // sports still get a season line; real stat keys never start with __.
      stats: {
        ...(inputs.statsByLeague.get(m.leagueId) ?? {}),
        ...(rec ? { __w: rec.wins, __l: rec.losses, __t: rec.ties } : {}),
      },
      sortDate: date,
    }
  }).sort((a, b) => a.sortDate.localeCompare(b.sortDate))

  const bySport = new Map<string, CareerSeason[]>()
  for (const s of seasons) {
    const list = bySport.get(s.sport) ?? []
    list.push(s)
    bySport.set(s.sport, list)
  }

  const tables: CareerSportTable[] = [...bySport.entries()].map(([sport, rows]) => {
    let columns = (inputs.statDefsBySport.get(sport) ?? []).slice(0, 3)
    // Platform defaults define columns for every known sport, so "no columns"
    // almost never happens — the real question is whether this player has any
    // recorded values in them. A league that never tracks individual stats
    // shows the TEAM's season record instead of a row of dashes. T only when
    // a tie actually exists.
    const hasPlayerStats = columns.length > 0
      && rows.some((r) => columns.some((c) => r.stats[c.key] != null))
    if (!hasPlayerStats && rows.some((r) => r.stats.__w != null)) {
      const hasTies = rows.some((r) => (r.stats.__t ?? 0) > 0)
      columns = [
        { key: '__w', label: 'W' },
        { key: '__l', label: 'L' },
        ...(hasTies ? [{ key: '__t', label: 'T' }] : []),
      ]
    }
    const totals: Record<string, number> = {}
    for (const col of columns) {
      totals[col.key] = rows.reduce((sum, r) => sum + (r.stats[col.key] ?? 0), 0)
    }
    return { sport, columns, rows, totals }
  })

  // A separate table only earns its keep when its stat columns differ —
  // otherwise (most commonly: no stat definitions at all) splitting by sport
  // just repeats the same header row over each team. Merge identical shapes.
  const byShape = new Map<string, CareerSportTable>()
  for (const t of tables) {
    const shape = t.columns.map((c) => `${c.key}:${c.label}`).join('|')
    const existing = byShape.get(shape)
    if (!existing) {
      byShape.set(shape, t)
      continue
    }
    existing.sport = `${existing.sport}+${t.sport}`
    existing.rows = [...existing.rows, ...t.rows].sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    for (const col of existing.columns) {
      existing.totals[col.key] = (existing.totals[col.key] ?? 0) + (t.totals[col.key] ?? 0)
    }
  }
  const mergedTables = [...byShape.values()]

  // Sports with the longest history first
  mergedTables.sort((a, b) => b.rows.length - a.rows.length)

  return { seasons, tables: mergedTables, seasonCount: seasons.length }
}

type Db = ReturnType<typeof createServiceRoleClient>

/** Loads and assembles a player's career in one org. */
export async function getPlayerCareer(db: Db, orgId: string, userId: string): Promise<PlayerCareer> {
  // Every team the player has been on (past teams included — history is the point)
  const { data: memberRows } = await db
    .from('team_members')
    .select('team_id, status, team:teams!team_members_team_id_fkey(id, name, league_id, league:leagues!teams_league_id_fkey(id, name, sport, season_start_date, created_at))')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .in('status', ['active', 'inactive'])

  const memberships: CareerInputs['memberships'] = []
  for (const m of memberRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = Array.isArray(m.team) ? m.team[0] : m.team as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const league = team ? (Array.isArray(team.league) ? team.league[0] : team.league as any) : null
    if (!team || !league) continue
    memberships.push({
      teamId: team.id,
      teamName: team.name,
      leagueId: league.id,
      leagueName: league.name,
      sport: league.sport ?? 'other',
      seasonStart: league.season_start_date ?? null,
      createdAt: league.created_at ?? null,
    })
  }
  if (memberships.length === 0) return { seasons: [], tables: [], seasonCount: 0 }

  const leagueIds = [...new Set(memberships.map((m) => m.leagueId))]
  const sports = [...new Set(memberships.map((m) => m.sport))]

  const [{ data: statRows }, { data: medalRows }, statDefsList, { data: gameRows }] = await Promise.all([
    db.from('player_game_stats')
      .select('league_id, stat_key, value')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .in('league_id', leagueIds),
    db.from('medals')
      .select('league_id, team_id, placement, awarded_at')
      .eq('organization_id', orgId)
      .in('league_id', leagueIds),
    Promise.all(sports.map(async (sport) => ({ sport, defs: await getStatDefinitions(orgId, sport) }))),
    // Confirmed results for the member leagues — the card back's TEAM record
    // when a sport tracks no player stats. All confirmed games count (pool and
    // playoff included): it's a career line, not the standings table.
    db.from('games')
      .select('league_id, home_team_id, away_team_id, game_results(home_score, away_score, status, sets, is_forfeit, forfeit_team_id)')
      .eq('organization_id', orgId)
      .in('league_id', leagueIds),
  ])

  const statsByLeague = new Map<string, Record<string, number>>()
  for (const r of statRows ?? []) {
    const rec = statsByLeague.get(r.league_id) ?? {}
    rec[r.stat_key] = (rec[r.stat_key] ?? 0) + Number(r.value ?? 0)
    statsByLeague.set(r.league_id, rec)
  }

  const medalByLeagueTeam = new Map<string, string>()
  for (const m of medalRows ?? []) {
    if (m.team_id) medalByLeagueTeam.set(`${m.league_id}:${m.team_id}`, m.placement)
  }

  const statDefsBySport = new Map(
    statDefsList.map(({ sport, defs }) => [sport, defs.map((d) => ({ key: d.key, label: d.label }))])
  )

  // W/L/T per league via the shared standings arithmetic, then keyed per team.
  const sportByLeague = new Map(memberships.map((m) => [m.leagueId, m.sport]))
  const statsByLeagueTeam = new Map<string, Map<string, TeamStatTotals>>()
  for (const g of gameRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = Array.isArray((g as any).game_results) ? (g as any).game_results[0] : (g as any).game_results
    if (!result || result.status !== 'confirmed' || !g.home_team_id || !g.away_team_id) continue
    const acc = statsByLeagueTeam.get(g.league_id) ?? new Map<string, TeamStatTotals>()
    statsByLeagueTeam.set(g.league_id, acc)
    accumulateGameResult(acc, {
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
      homeScore: result.home_score,
      awayScore: result.away_score,
      sets: result.sets ?? null,
      isForfeit: result.is_forfeit ?? null,
      forfeitTeamId: result.forfeit_team_id ?? null,
    }, isVolleyballSport(sportByLeague.get(g.league_id) ?? null))
  }
  const teamRecordByLeagueTeam = new Map<string, { played: number; wins: number; losses: number; ties: number }>()
  for (const m of memberships) {
    const t = statsByLeagueTeam.get(m.leagueId)?.get(m.teamId)
    if (t) teamRecordByLeagueTeam.set(`${m.leagueId}:${m.teamId}`, {
      played: t.matchesPlayed, wins: t.wins, losses: t.losses, ties: t.ties,
    })
  }

  const career = buildCareer({ memberships, statsByLeague, medalByLeagueTeam, statDefsBySport, teamRecordByLeagueTeam })

  // Reigning champion: a gold in the last 365 days on a team the player was on
  const myTeamKeys = new Set(memberships.map((m) => `${m.leagueId}:${m.teamId}`))
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
  career.reigningChampion = (medalRows ?? []).some((m) =>
    m.placement === 'gold' &&
    m.team_id && myTeamKeys.has(`${m.league_id}:${m.team_id}`) &&
    m.awarded_at && new Date(m.awarded_at).getTime() >= yearAgo
  )
  return career
}
