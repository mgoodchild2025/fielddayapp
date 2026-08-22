import type { createServiceRoleClient } from '@/lib/supabase/service'
import { getStatDefinitions } from '@/actions/stats'

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
}

/** Pure assembly — tested. */
export function buildCareer(inputs: CareerInputs): PlayerCareer {
  const seasons: CareerSeason[] = inputs.memberships.map((m) => {
    const date = m.seasonStart ?? m.createdAt ?? ''
    const placement = inputs.medalByLeagueTeam.get(`${m.leagueId}:${m.teamId}`)
    return {
      seasonLabel: date ? String(new Date(date).getFullYear()) : '—',
      teamName: m.teamName,
      leagueName: m.leagueName,
      sport: m.sport || 'other',
      medal: placement ? (MEDAL_GLYPH[placement] ?? null) : null,
      stats: inputs.statsByLeague.get(m.leagueId) ?? {},
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
    const columns = (inputs.statDefsBySport.get(sport) ?? []).slice(0, 3)
    const totals: Record<string, number> = {}
    for (const col of columns) {
      totals[col.key] = rows.reduce((sum, r) => sum + (r.stats[col.key] ?? 0), 0)
    }
    return { sport, columns, rows, totals }
  })
  // Sports with the longest history first
  tables.sort((a, b) => b.rows.length - a.rows.length)

  return { seasons, tables, seasonCount: seasons.length }
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

  const [{ data: statRows }, { data: medalRows }, statDefsList] = await Promise.all([
    db.from('player_game_stats')
      .select('league_id, stat_key, value')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .in('league_id', leagueIds),
    db.from('medals')
      .select('league_id, team_id, placement')
      .eq('organization_id', orgId)
      .in('league_id', leagueIds),
    Promise.all(sports.map(async (sport) => ({ sport, defs: await getStatDefinitions(orgId, sport) }))),
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

  return buildCareer({ memberships, statsByLeague, medalByLeagueTeam, statDefsBySport })
}
