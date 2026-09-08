import type { createServiceRoleClient } from '@/lib/supabase/service'
import type { PodiumMedal } from '@/components/medals/event-podium'
import { getStatDefinitions } from '@/actions/stats'
import {
  decoratedTiers, repeatChampions, statLeaders, tenureTiers,
  type DecoratedTier, type MedalRecipientRow, type RepeatChampion, type StatLeaderBoard, type TenureTier,
} from '@/lib/hall-boards'

/**
 * Hall of Champions (H1+H2): the org's whole title history in one read.
 * Everything comes from the medals snapshots — league/team names and rosters
 * as they were at award time — so the Hall survives renames, team deletion,
 * and event archival.
 */

export interface ChampionsBanner {
  medalId: string
  year: string
  teamName: string
  leagueName: string
  leagueId: string
  /** Live team identity where the team still exists — felt colour + logo badge. */
  teamId: string | null
  logoUrl: string | null
  color: string | null
}

export interface ChampionsEvent {
  leagueId: string
  leagueName: string
  leagueSlug: string | null
  medals: PodiumMedal[]
}

export interface ChampionsSeason {
  year: string
  events: ChampionsEvent[]
}

export interface DynastyRow {
  teamName: string
  titles: number
  years: string[]
}

export interface HallOfChampions {
  banners: ChampionsBanner[]
  seasons: ChampionsSeason[]
  dynasties: DynastyRow[]
  /** Most decorated — players grouped by identical medal tally (ties shown, nobody cut). */
  decorated: DecoratedTier[]
  /** Gold in two or more different events. */
  repeatChampions: RepeatChampion[]
  /** Most seasons played, grouped by count (top tiers). */
  tenure: TenureTier[]
  /** Career leaders in each sport's headline stat, where stats are kept. */
  statLeaders: StatLeaderBoard[]
  totalTitles: number
}

const PODIUM_ORDER: Record<string, number> = { gold: 0, silver: 1, bronze: 2, tier_champion: 3 }

type Db = ReturnType<typeof createServiceRoleClient>

export async function getHallOfChampions(db: Db, orgId: string): Promise<HallOfChampions> {
  const { data: medalRows } = await db
    .from('medals')
    .select('id, league_id, league_name, team_name, team_id, placement, label, awarded_at, medal_recipients(user_id, display_name), league:leagues!medals_league_id_fkey(slug)')
    .eq('organization_id', orgId)
    .order('awarded_at', { ascending: false })

  const rows = ((medalRows ?? []) as {
    id: string; league_id: string; league_name: string; team_name: string; team_id: string | null
    placement: string; label: string; awarded_at: string
    medal_recipients: { user_id: string | null; display_name: string }[]
    league: { slug: string } | { slug: string }[] | null
  }[])

  // Team identity for podium logos — live team rows where they still exist
  const teamIds = [...new Set(rows.map((m) => m.team_id).filter((id): id is string => !!id))]
  const { data: teamRows } = teamIds.length > 0
    ? await db.from('teams').select('id, logo_url, color').in('id', teamIds)
    : { data: [] }
  const teamMeta = new Map(
    (teamRows ?? []).map((t) => [t.id, { logoUrl: t.logo_url ?? null, color: t.color ?? null }])
  )

  // ── Banners: golds only — banners mean titles ──────────────────────────────
  const banners: ChampionsBanner[] = rows
    .filter((m) => m.placement === 'gold')
    .map((m) => ({
      medalId: m.id,
      year: String(new Date(m.awarded_at).getFullYear()),
      teamName: m.team_name,
      leagueName: m.league_name,
      leagueId: m.league_id,
      teamId: m.team_id,
      logoUrl: m.team_id ? (teamMeta.get(m.team_id)?.logoUrl ?? null) : null,
      color: m.team_id ? (teamMeta.get(m.team_id)?.color ?? null) : null,
    }))

  // ── Seasons: year → events → podiums (EventPodium's own shape) ─────────────
  const byYear = new Map<string, Map<string, ChampionsEvent>>()
  for (const m of rows) {
    const year = String(new Date(m.awarded_at).getFullYear())
    const league = Array.isArray(m.league) ? m.league[0] : m.league
    const events = byYear.get(year) ?? new Map<string, ChampionsEvent>()
    const event = events.get(m.league_id) ?? {
      leagueId: m.league_id,
      leagueName: m.league_name,
      leagueSlug: league?.slug ?? null,
      medals: [],
    }
    event.medals.push({
      id: m.id,
      placement: m.placement as PodiumMedal['placement'],
      label: m.label,
      teamName: m.team_name,
      logoUrl: m.team_id ? (teamMeta.get(m.team_id)?.logoUrl ?? null) : null,
      color: m.team_id ? (teamMeta.get(m.team_id)?.color ?? null) : null,
      recipients: (m.medal_recipients ?? []).map((r) => r.display_name),
    })
    events.set(m.league_id, event)
    byYear.set(year, events)
  }
  const seasons: ChampionsSeason[] = [...byYear.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, events]) => ({
      year,
      events: [...events.values()].map((e) => ({
        ...e,
        medals: e.medals.sort((a, b) => (PODIUM_ORDER[a.placement] ?? 9) - (PODIUM_ORDER[b.placement] ?? 9)),
      })),
    }))

  // ── Dynasties: titles by team-NAME snapshot (labelled caveat on the page) ──
  const dynastyMap = new Map<string, DynastyRow>()
  for (const b of banners) {
    const key = b.teamName.trim().toLowerCase()
    const row = dynastyMap.get(key) ?? { teamName: b.teamName, titles: 0, years: [] }
    row.titles++
    if (!row.years.includes(b.year)) row.years.push(b.year)
    dynastyMap.set(key, row)
  }
  const dynasties = [...dynastyMap.values()]
    .filter((d) => d.titles >= 2) // a dynasty is repeat success; single titles live on the wall
    .sort((a, b) => b.titles - a.titles || a.teamName.localeCompare(b.teamName))

  // ── Player boards (lib/hall-boards.ts) ─────────────────────────────────────
  const recipientRows: MedalRecipientRow[] = rows.flatMap((m) =>
    (m.medal_recipients ?? []).map((r) => ({
      medalId: m.id, leagueId: m.league_id, placement: m.placement,
      year: String(new Date(m.awarded_at).getFullYear()), userId: r.user_id, name: r.display_name,
    })))
  const decorated = decoratedTiers(recipientRows)
  const repeats = repeatChampions(recipientRows)

  // Seasons played + career stats need the live roster/stat tables (not medal snapshots).
  const [{ data: memberRows }, { data: statRows }] = await Promise.all([
    db.from('team_members')
      .select('user_id, profile:profiles!team_members_user_id_fkey(full_name), team:teams!team_members_team_id_fkey(league_id, league:leagues!teams_league_id_fkey(sport))')
      .eq('organization_id', orgId)
      .in('status', ['active', 'inactive'])
      .limit(20000),
    db.from('player_game_stats')
      .select('user_id, league_id, stat_key, value')
      .eq('organization_id', orgId)
      .limit(50000),
  ])
  type MemberRow = { user_id: string | null; profile: { full_name: string | null } | { full_name: string | null }[] | null; team: { league_id: string | null; league: { sport: string | null } | { sport: string | null }[] | null } | { league_id: string | null; league: { sport: string | null } | { sport: string | null }[] | null }[] | null }
  const nameByUser = new Map<string, string>()
  const sportByLeague = new Map<string, string>()
  const memberships: { userId: string; name: string; leagueId: string }[] = []
  for (const m of (memberRows ?? []) as unknown as MemberRow[]) {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    const team = Array.isArray(m.team) ? m.team[0] : m.team
    const league = team ? (Array.isArray(team.league) ? team.league[0] : team.league) : null
    if (!m.user_id || !team?.league_id) continue
    const name = profile?.full_name ?? 'Player'
    nameByUser.set(m.user_id, name)
    if (league?.sport) sportByLeague.set(team.league_id, league.sport)
    memberships.push({ userId: m.user_id, name, leagueId: team.league_id })
  }
  const tenure = tenureTiers(memberships)

  const statSports = [...new Set((statRows ?? []).map((r) => sportByLeague.get(r.league_id)).filter((s): s is string => !!s))]
  const headline = new Map<string, { key: string; label: string }>()
  await Promise.all(statSports.map(async (sport) => {
    const defs = await getStatDefinitions(orgId, sport)
    if (defs[0]) headline.set(sport, { key: defs[0].key, label: defs[0].label })
  }))
  const leaders = statLeaders(
    (statRows ?? []).flatMap((r) => {
      const sport = sportByLeague.get(r.league_id)
      if (!sport || !r.user_id) return []
      return [{ userId: r.user_id, name: nameByUser.get(r.user_id) ?? 'Player', sport, statKey: r.stat_key, value: Number(r.value ?? 0) }]
    }),
    headline,
  )

  return { banners, seasons, dynasties, decorated, repeatChampions: repeats, tenure, statLeaders: leaders, totalTitles: banners.length }
}

/** Cheap existence check for the conditional nav link. */
export async function orgHasMedals(db: Db, orgId: string): Promise<boolean> {
  const { count } = await db
    .from('medals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  return (count ?? 0) > 0
}
