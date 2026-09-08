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
  leagueId: string
  sport: string
  /** Medal glyph when this team medalled in this league ("🥇" / "🥈" / "🥉" / "🏆"). */
  medal: string | null
  /** The TEAM's season record as "W-L" (or "W-L-T" when tied), null when no confirmed games. */
  record: string | null
  stats: Record<string, number>
  /** Sort key, not displayed. */
  sortDate: string
}

export interface CareerSportTable {
  sport: string
  /** Up to three columns — a hockey-card constraint, not a technical one. */
  columns: { key: string; label: string }[]
  /** True when the columns ARE the team record (W/L/T) — the card then doesn't
   *  repeat it in the team cell. False = real stat columns; record rides in the cell. */
  recordColumns: boolean
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
  /** Leagues where ANY player has recorded stats. Decides the column shape per
   *  league rather than per player, so teammates' cards match: a stat-tracking
   *  league shows stat columns for everyone (dashes for the uncredited). */
  leaguesTrackingStats?: Set<string>
}

function formatRecord(rec: { wins: number; losses: number; ties: number } | undefined): string | null {
  if (!rec) return null
  return rec.ties > 0 ? `${rec.wins}-${rec.losses}-${rec.ties}` : `${rec.wins}-${rec.losses}`
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
      leagueId: m.leagueId,
      sport: m.sport || 'other',
      medal: placement ? (MEDAL_GLYPH[placement] ?? null) : null,
      record: formatRecord(rec),
      // Reserved __-prefixed keys carry the TEAM record so no-player-stat
      // sports still get a season line; real stat keys never start with __.
      stats: {
        ...(inputs.statsByLeague.get(m.leagueId) ?? {}),
        ...(rec ? { __w: rec.wins, __l: rec.losses, __t: rec.ties } : {}),
      },
      sortDate: date,
    }
  }).sort((a, b) => a.sortDate.localeCompare(b.sortDate))

  // Column shape is a function of the LEAGUE alone — never of this player's
  // other seasons — so every card on a team shows the same columns for that
  // season row (a veteran's history can't drag stat columns onto a league that
  // hasn't started; a newcomer's blank slate can't pull W/L/T onto a
  // stat-tracking league):
  //   league tracks stats (anyone credited — this player's own values count) →
  //     the sport's stat columns, hockey-card capped at three;
  //   otherwise → the team record, always W L T, so record rows always align.
  // Rows are grouped by shape, not by sport; a player whose leagues differ in
  // shape gets one table per shape, stacked.
  const RECORD_COLUMNS = [{ key: '__w', label: 'W' }, { key: '__l', label: 'L' }, { key: '__t', label: 'T' }]
  const shapeFor = (row: CareerSeason): { columns: { key: string; label: string }[]; recordColumns: boolean } => {
    const defs = (inputs.statDefsBySport.get(row.sport) ?? []).slice(0, 3)
    const tracks = defs.length > 0 && (
      inputs.leaguesTrackingStats?.has(row.leagueId) === true ||
      Object.keys(inputs.statsByLeague.get(row.leagueId) ?? {}).length > 0
    )
    return tracks ? { columns: defs, recordColumns: false } : { columns: RECORD_COLUMNS, recordColumns: true }
  }

  const byShape = new Map<string, CareerSportTable>()
  for (const row of seasons) {
    const { columns, recordColumns } = shapeFor(row)
    const shape = columns.map((c) => `${c.key}:${c.label}`).join('|')
    let table = byShape.get(shape)
    if (!table) {
      table = { sport: row.sport, columns, recordColumns, rows: [], totals: {} }
      byShape.set(shape, table)
    } else if (!table.sport.split('+').includes(row.sport)) {
      table.sport = `${table.sport}+${row.sport}`
    }
    table.rows.push(row)
  }
  const mergedTables = [...byShape.values()]
  for (const t of mergedTables) {
    t.rows.sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    for (const col of t.columns) t.totals[col.key] = t.rows.reduce((sum, r) => sum + (r.stats[col.key] ?? 0), 0)
  }

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

  const [{ data: statRows }, { data: medalRows }, statDefsList, { data: gameRows }, trackingFlags] = await Promise.all([
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
    // Does ANYONE have stats in each league? One cheap head-count per league.
    Promise.all(leagueIds.map(async (leagueId) => {
      const { count } = await db
        .from('player_game_stats')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('league_id', leagueId)
        .limit(1)
      return { leagueId, tracks: (count ?? 0) > 0 }
    })),
  ])
  const leaguesTrackingStats = new Set(trackingFlags.filter((f) => f.tracks).map((f) => f.leagueId))

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

  const career = buildCareer({ memberships, statsByLeague, medalByLeagueTeam, statDefsBySport, teamRecordByLeagueTeam, leaguesTrackingStats })

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
