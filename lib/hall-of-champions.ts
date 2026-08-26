import type { createServiceRoleClient } from '@/lib/supabase/service'
import type { PodiumMedal } from '@/components/medals/event-podium'

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

export interface DecoratedPlayerRow {
  userId: string | null
  name: string
  gold: number
  silver: number
  bronze: number
  tierTitles: number
  /** 🥇-weighted ordering score. */
  score: number
}

export interface HallOfChampions {
  banners: ChampionsBanner[]
  seasons: ChampionsSeason[]
  dynasties: DynastyRow[]
  decorated: DecoratedPlayerRow[]
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

  // ── Most decorated: 🥇-weighted, top 10 ────────────────────────────────────
  const playerMap = new Map<string, DecoratedPlayerRow>()
  for (const m of rows) {
    for (const r of m.medal_recipients ?? []) {
      const key = r.user_id ?? `name:${r.display_name.toLowerCase()}`
      const row = playerMap.get(key) ?? {
        userId: r.user_id, name: r.display_name, gold: 0, silver: 0, bronze: 0, tierTitles: 0, score: 0,
      }
      if (m.placement === 'gold') { row.gold++; row.score += 1000 }
      else if (m.placement === 'silver') { row.silver++; row.score += 100 }
      else if (m.placement === 'bronze') { row.bronze++; row.score += 10 }
      else { row.tierTitles++; row.score += 1 }
      playerMap.set(key, row)
    }
  }
  const decorated = [...playerMap.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 10)

  return { banners, seasons, dynasties, decorated, totalTitles: banners.length }
}

/** Cheap existence check for the conditional nav link. */
export async function orgHasMedals(db: Db, orgId: string): Promise<boolean> {
  const { count } = await db
    .from('medals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  return (count ?? 0) > 0
}
