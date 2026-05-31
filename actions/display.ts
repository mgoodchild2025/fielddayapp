'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type {
  DisplayConfig, DisplayData, DisplayGame, DisplayStanding, DisplayBracketMatch,
} from '@/lib/display-types'
import { defaultConfig, ZONE_COUNT } from '@/lib/display-types'
import {
  sortStandings, isVolleyballSport,
  type PtsMethod, type VolleyballMode, type TeamStat,
} from '@/lib/standings'

// ── Config persistence ────────────────────────────────────────────────────────

export async function getDisplayConfig(
  leagueId: string,
  screen: number,
): Promise<{ config: DisplayConfig; enabled: boolean } | null> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_display_configs')
    .select('config, enabled')
    .eq('league_id', leagueId)
    .eq('screen_number', screen)
    .single() as { data: { config: DisplayConfig; enabled: boolean } | null }

  if (!data) return null
  return { config: data.config as DisplayConfig, enabled: data.enabled }
}

export async function saveDisplayConfig(
  leagueId: string,
  screen: number,
  config: DisplayConfig,
  enabled: boolean,
): Promise<{ error: string | null }> {
  try {
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    await requireOrgMember(org, ['org_admin', 'league_admin'])

    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('event_display_configs')
      .upsert({
        league_id:       leagueId,
        organization_id: org.id,
        screen_number:   screen,
        config,
        enabled,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'league_id,screen_number' })

    if (error) return { error: error.message }
    revalidatePath(`/admin/events/${leagueId}/display`)
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save display config.' }
  }
}

export async function deleteDisplayScreen(
  leagueId: string,
  screen: number,
): Promise<{ error: string | null }> {
  try {
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    await requireOrgMember(org, ['org_admin', 'league_admin'])

    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('event_display_configs')
      .delete()
      .eq('league_id', leagueId)
      .eq('screen_number', screen)
    revalidatePath(`/admin/events/${leagueId}/display`)
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete screen.' }
  }
}

// ── Display data fetching (public — used by TV page, no auth needed) ──────────

export async function getDisplayData(
  leagueId: string,
  orgId: string,
  config: DisplayConfig,
  timezone: string,
): Promise<DisplayData> {
  const db = createServiceRoleClient()

  const zoneTypes = new Set(config.zones.map((z) => z.type))
  const needsSchedule  = zoneTypes.has('schedule')
  const needsStandings = zoneTypes.has('standings')
  const needsBracket   = zoneTypes.has('bracket')

  // Base queries always needed
  const [{ data: leagueRow }, { data: brandingRow }, { data: poolsData }, { data: orgRow }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, sport, standings_pts_method, volleyball_standings_mode').eq('id', leagueId).single(),
    db.from('org_branding').select('logo_url').eq('organization_id', orgId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('pools').select('id, name, sort_order')
      .eq('league_id', leagueId).eq('organization_id', orgId).order('sort_order'),
    db.from('organizations').select('name').eq('id', orgId).single(),
  ])

  // Current live stream for the org (manual Go Live)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: liveRow } = await (db as any)
    .from('live_streams')
    .select('platform, title, url, embed_url')
    .eq('organization_id', orgId)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const liveStream = (liveRow as { platform: string; title: string | null; url: string; embed_url: string | null } | null) ?? null

  // Team lookup by name — used to enrich label-based games (no FK) with color/logo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allTeamsData } = await (db as any)
    .from('teams').select('name, color, logo_url')
    .eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active')
  type TeamMeta = { color: string | null; logo_url: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamByName = new Map<string, TeamMeta>((allTeamsData ?? []).map((t: any) => [
    (t.name as string).toLowerCase().trim(),
    { color: t.color ?? null, logo_url: t.logo_url ?? null },
  ]))

  // ── Schedule ────────────────────────────────────────────────────────────────
  let games: DisplayGame[] = []
  if (needsSchedule) {
    // Compute today's UTC bounds using org timezone
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
    const [y, m, d] = todayStr.split('-').map(Number)
    // "midnight tonight" in the org timezone → convert to UTC
    const dayStartLocal = new Date(y, m - 1, d, 0, 0, 0)
    const dayEndLocal   = new Date(y, m - 1, d, 23, 59, 59)
    // Offset: difference between local time and UTC
    const tzOffset = dayStartLocal.getTimezoneOffset() // minutes, inverted
    const dayStartUtc = new Date(dayStartLocal.getTime() + tzOffset * 60000)
    const dayEndUtc   = new Date(dayEndLocal.getTime()   + tzOffset * 60000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, status, pool_id,
        home_team:teams!games_home_team_id_fkey(name, color, logo_url),
        away_team:teams!games_away_team_id_fkey(name, color, logo_url),
        home_team_label, away_team_label,
        game_results(home_score, away_score, status)
      `)
      .eq('league_id', leagueId)
      .eq('organization_id', orgId)
      .order('scheduled_at', { ascending: true })

    // Find schedule zones with date_filter
    const schedZone = config.zones.find((z) => z.type === 'schedule') as { type: 'schedule'; date_filter: string } | undefined
    if (schedZone?.date_filter === 'today') {
      q = q.gte('scheduled_at', dayStartUtc.toISOString()).lte('scheduled_at', dayEndUtc.toISOString())
    }

    const { data: gamesData } = await q

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    games = (gamesData ?? []).map((g: any) => {
      const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
      const home = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const away = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team

      // When a game uses a label instead of a team FK, try to match by name
      // so logos + colors still appear for known teams
      const homeName = home?.name ?? g.home_team_label ?? 'TBD'
      const awayName = away?.name ?? g.away_team_label ?? 'TBD'
      const homeFallback = home ? null : teamByName.get(homeName.toLowerCase().trim()) ?? null
      const awayFallback = away ? null : teamByName.get(awayName.toLowerCase().trim()) ?? null

      return {
        id:            g.id,
        scheduled_at:  g.scheduled_at,
        court:         g.court ?? null,
        home_name:     homeName,
        away_name:     awayName,
        home_color:    home?.color ?? homeFallback?.color ?? null,
        away_color:    away?.color ?? awayFallback?.color ?? null,
        home_logo_url: home?.logo_url ?? homeFallback?.logo_url ?? null,
        away_logo_url: away?.logo_url ?? awayFallback?.logo_url ?? null,
        home_score:    result?.home_score ?? null,
        away_score:    result?.away_score ?? null,
        result_status: result?.status ?? null,
        game_status:   g.status ?? 'scheduled',
        pool_id:       g.pool_id ?? null,
      } satisfies DisplayGame
    })
  }

  // ── Standings ───────────────────────────────────────────────────────────────
  const ptsMethod: PtsMethod = ((leagueRow as { standings_pts_method?: string } | null)?.standings_pts_method ?? 'wins') as PtsMethod
  const volleyballMode: VolleyballMode = ((leagueRow as { volleyball_standings_mode?: string } | null)?.volleyball_standings_mode ?? 'match_based') as VolleyballMode
  const sport = leagueRow?.sport ?? ''
  const isVb = isVolleyballSport(sport)

  let standings: DisplayStanding[] = []
  let poolStandings: DisplayStanding[] = []
  if (needsStandings) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: teamsData }, { data: resultsData }] = await Promise.all([
      (db as any).from('teams').select('id, name, color, logo_url, pool_id')
        .eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
      (db as any).from('game_results')
        .select('home_score, away_score, status, sets, is_forfeit, forfeit_team_id, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
        .eq('organization_id', orgId)
        .eq('status', 'confirmed'),
    ])

    const stat = () => ({ played: 0, won: 0, lost: 0, drawn: 0, gf: 0, ga: 0, setWins: 0, setLosses: 0 })
    // Two record maps:
    //   combinedRecords → ALL games (regular + pool). Drives the "all teams"
    //     overall standings, matching the Event standings page's Overall table.
    //   poolRecords → pool-play games only. Drives per-pool standings, matching
    //     the public Pool Play tab.
    const combinedRecords: Record<string, ReturnType<typeof stat>> = {}
    const poolRecords: Record<string, ReturnType<typeof stat>> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamIds = new Set<string>((teamsData ?? []).map((t: any) => t.id as string))

    for (const r of resultsData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = Array.isArray(r.game) ? r.game[0] : r.game as any
      if (!g || g.league_id !== leagueId) continue
      const { home_team_id: ht, away_team_id: at } = g
      if (!ht || !at || !teamIds.has(ht) || !teamIds.has(at)) continue

      const hs = r.home_score ?? 0
      const as_ = r.away_score ?? 0

      // Accumulate into the combined record always; into pool record for pool games.
      const targets = g.pool_id ? [combinedRecords, poolRecords] : [combinedRecords]
      for (const records of targets) {
        if (!records[ht]) records[ht] = stat()
        if (!records[at]) records[at] = stat()
        records[ht].played++; records[at].played++
        // Double forfeit (flagged, no forfeiting team) = loss for both
        if (r.is_forfeit && !r.forfeit_team_id) { records[ht].lost++; records[at].lost++ }
        else if (hs > as_)  { records[ht].won++;   records[at].lost++ }
        else if (as_ > hs)  { records[at].won++;   records[ht].lost++ }
        else                { records[ht].drawn++; records[at].drawn++ }

        // Volleyball: accumulate set-level points + set wins/losses; otherwise match scores
        if (isVb && Array.isArray(r.sets)) {
          for (const s of r.sets as { home: number; away: number }[]) {
            records[ht].gf += s.home; records[ht].ga += s.away
            records[at].gf += s.away; records[at].ga += s.home
            if (s.home > s.away)      { records[ht].setWins++; records[at].setLosses++ }
            else if (s.away > s.home) { records[at].setWins++; records[ht].setLosses++ }
          }
        } else {
          records[ht].gf += hs; records[ht].ga += as_
          records[at].gf += as_; records[at].ga += hs
        }
      }
    }

    // Build a DisplayStanding for a team from its accumulated record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const build = (t: any, s: ReturnType<typeof stat>): DisplayStanding => ({
      rank: 0, team_id: t.id, name: t.name, color: t.color ?? null,
      logo_url: t.logo_url ?? null, pool_id: t.pool_id ?? null,
      played: s.played, won: s.won, lost: s.lost, drawn: s.drawn,
      gf: s.gf, ga: s.ga, setWins: s.setWins, setLosses: s.setLosses,
      pts: s.won * 3 + s.drawn,
    })

    // Map a DisplayStanding to the shared TeamStat shape for sorting
    const toStat = (d: DisplayStanding): TeamStat & { _d: DisplayStanding } => ({
      id: d.team_id, name: d.name,
      matchesPlayed: d.played, wins: d.won, losses: d.lost, ties: d.drawn,
      pointsFor: d.gf, pointsAgainst: d.ga, setWins: d.setWins, setLosses: d.setLosses,
      _d: d,
    })

    const rankSorted = (items: DisplayStanding[]): DisplayStanding[] =>
      sortStandings(items.map(toStat), sport, volleyballMode, ptsMethod)
        .map((s, i) => ({ ...s._d, rank: i + 1 }))

    // ── Overall standings (all teams, all games) — matches the Event
    //    standings page's Overall table; used by the "all teams" zone. ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standings = rankSorted((teamsData ?? []).map((t: any) => build(t, combinedRecords[t.id] ?? stat())))

    // ── Pool-play standings (pool teams only, pool games only), ranked within each pool ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolRaw = (teamsData ?? []).filter((t: any) => t.pool_id).map((t: any) => build(t, poolRecords[t.id] ?? stat()))
    const byPool = new Map<string, DisplayStanding[]>()
    for (const t of poolRaw) {
      if (!byPool.has(t.pool_id!)) byPool.set(t.pool_id!, [])
      byPool.get(t.pool_id!)!.push(t)
    }
    poolStandings = []
    for (const group of byPool.values()) {
      poolStandings.push(...rankSorted(group))
    }
  }

  // ── Bracket ─────────────────────────────────────────────────────────────────
  let bracket: DisplayData['bracket'] = null
  if (needsBracket) {
    // Collect bracket references: try playoff_tiers (Gold/Silver/etc.) first,
    // then fall back to fetching the most recent bracket directly.
    type BracketRef = { bracketId: string; tierName: string | null }
    const bracketRefs: BracketRef[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: configRow } = await (db as any)
      .from('playoff_configs')
      .select('id')
      .eq('league_id', leagueId)
      .eq('organization_id', orgId)
      .maybeSingle() as { data: { id: string } | null }

    if (configRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tiersData } = await (db as any)
        .from('playoff_tiers')
        .select('name, bracket_id, sort_order')
        .eq('config_id', configRow.id)
        .not('bracket_id', 'is', null)
        .order('sort_order') as { data: { name: string; bracket_id: string; sort_order: number }[] | null }

      for (const t of tiersData ?? []) {
        if (t.bracket_id) bracketRefs.push({ bracketId: t.bracket_id, tierName: t.name })
      }
    }

    // Fallback: no tiers configured — fetch the most recently created bracket
    if (bracketRefs.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bracketRow } = await (db as any)
        .from('brackets')
        .select('id')
        .eq('league_id', leagueId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: { id: string } | null }

      if (bracketRow) bracketRefs.push({ bracketId: bracketRow.id, tierName: null })
    }

    if (bracketRefs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchMatches = async (bracketId: string): Promise<DisplayBracketMatch[]> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: matchesData } = await (db as any)
          .from('bracket_matches')
          .select(`
            id, round_number, match_number, score1, score2, status,
            scheduled_at, court,
            team1_label, team2_label,
            team1:teams!bracket_matches_team1_id_fkey(name),
            team2:teams!bracket_matches_team2_id_fkey(name),
            winner:teams!bracket_matches_winner_team_id_fkey(id)
          `)
          .eq('bracket_id', bracketId)
          .order('round_number').order('match_number')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (matchesData ?? []).map((m: any) => {
          const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1
          const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2
          const w  = Array.isArray(m.winner) ? m.winner[0] : m.winner
          return {
            id:           m.id,
            round_number: m.round_number,
            match_number: m.match_number,
            team1_name:   t1?.name ?? m.team1_label ?? null,
            team2_name:   t2?.name ?? m.team2_label ?? null,
            score1:       m.score1 ?? null,
            score2:       m.score2 ?? null,
            winner_id:    w?.id ?? null,
            status:       m.status ?? 'pending',
            is_bye:       m.team2_label === 'Bye',
            scheduled_at: m.scheduled_at ?? null,
            court:        m.court ?? null,
          } satisfies DisplayBracketMatch
        })
      }

      const tiers = await Promise.all(
        bracketRefs.map(async ({ bracketId, tierName }) => ({
          name:    tierName,
          matches: await fetchMatches(bracketId),
        }))
      )

      bracket = { tiers }
    }
  }

  return {
    league:   { id: leagueRow?.id ?? leagueId, name: leagueRow?.name ?? '', sport: leagueRow?.sport ?? '' },
    org:      { name: orgRow?.name ?? '', logo_url: brandingRow?.logo_url ?? null },
    timezone,
    pools:    (poolsData ?? []) as { id: string; name: string }[],
    games,
    standings,
    poolStandings,
    standingsConfig: { ptsMethod, volleyballMode },
    bracket,
    live: liveStream,
  }
}

// ── List all screen numbers that have a config saved ─────────────────────────

export async function getDisplayScreens(
  leagueId: string,
): Promise<{ screen_number: number; enabled: boolean }[]> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('event_display_configs')
    .select('screen_number, enabled')
    .eq('league_id', leagueId)
    .order('screen_number') as { data: { screen_number: number; enabled: boolean }[] | null }
  return data ?? []
}

