'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type {
  DisplayConfig, DisplayData, DisplayGame, DisplayStanding, DisplayBracketMatch, ZoneConfig,
} from '@/lib/display-types'
import { defaultConfig, ZONE_COUNT } from '@/lib/display-types'
import type { Json } from '@/types/database'
import { getEventSponsors } from '@/actions/event-sponsors'
import {
  sortStandings, isVolleyballSport, accumulateGameResult, emptyTeamStat,
  type PtsMethod, type VolleyballMode, type TeamStat, type TeamStatTotals,
} from '@/lib/standings'

// ── Config persistence ────────────────────────────────────────────────────────

export async function getDisplayConfig(
  leagueId: string,
  screen: number,
): Promise<{ config: DisplayConfig; enabled: boolean } | null> {
  const db = createServiceRoleClient()

  const { data } = await db
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

    const { error } = await db
      .from('event_display_configs')
      .upsert({
        league_id:       leagueId,
        organization_id: org.id,
        screen_number:   screen,
        config: config as unknown as Json,
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

    await db
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
  const needsSponsors  = zoneTypes.has('sponsors') || config.sponsor_banner?.enabled === true || config.sponsor_interstitial?.enabled === true
  const needsShowcase  = zoneTypes.has('showcase')

  // Base queries always needed
  const [{ data: leagueRow }, { data: brandingRow }, { data: poolsData }, { data: orgRow }] = await Promise.all([

    db.from('leagues').select('id, name, sport, standings_pts_method, volleyball_standings_mode').eq('id', leagueId).single(),
    db.from('org_branding').select('logo_url').eq('organization_id', orgId).single(),

    db.from('pools').select('id, name, sort_order')
      .eq('league_id', leagueId).eq('organization_id', orgId).order('sort_order'),
    db.from('organizations').select('name').eq('id', orgId).single(),
  ])

  // Live stream for this screen.
  //  - If the screen pins a specific stream (config.live_stream_id), show only
  //    that one (when still live) so multiple screens can show different
  //    concurrent streams. If the pinned stream has ended, show nothing.
  //  - Otherwise prefer the most recent stream tied to THIS event, else org-wide.
  let liveStream: { platform: string; title: string | null; url: string; embed_url: string | null } | null = null
  if (config.live_stream_id) {

    const { data: pinned } = await db
      .from('live_streams')
      .select('platform, title, url, embed_url')
      .eq('organization_id', orgId).eq('id', config.live_stream_id).eq('status', 'live')
      .maybeSingle()
    liveStream = (pinned as typeof liveStream) ?? null
  } else {

    const { data: eventLive } = await db
      .from('live_streams')
      .select('platform, title, url, embed_url')
      .eq('organization_id', orgId).eq('league_id', leagueId).eq('status', 'live')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    liveStream = (eventLive as typeof liveStream) ?? null
    if (!liveStream) {

      const { data: orgLive } = await db
        .from('live_streams')
        .select('platform, title, url, embed_url')
        .eq('organization_id', orgId).is('league_id', null).eq('status', 'live')
        .order('started_at', { ascending: false }).limit(1).maybeSingle()
      liveStream = (orgLive as typeof liveStream) ?? null
    }
  }

  // Team lookup by name — used to enrich label-based games (no FK) with color/logo

  const { data: allTeamsData } = await db
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


    let q = db
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

    const [{ data: teamsData }, { data: resultsData }] = await Promise.all([
      db.from('teams').select('id, name, color, logo_url, pool_id')
        .eq('league_id', leagueId).eq('organization_id', orgId).eq('status', 'active'),
      db.from('game_results')
        .select('home_score, away_score, status, sets, is_forfeit, forfeit_team_id, game:games!game_results_game_id_fkey(home_team_id, away_team_id, league_id, status, pool_id)')
        .eq('organization_id', orgId)
        .eq('status', 'confirmed'),
    ])

    // Two record maps:
    //   combinedRecords → ALL games (regular + pool). Drives the "all teams"
    //     overall standings, matching the Event standings page's Overall table.
    //   poolRecords → pool-play games only. Drives per-pool standings, matching
    //     the public Pool Play tab.
    const combinedRecords = new Map<string, TeamStatTotals>()
    const poolRecords = new Map<string, TeamStatTotals>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamIds = new Set<string>((teamsData ?? []).map((t: any) => t.id as string))

    for (const r of resultsData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = Array.isArray(r.game) ? r.game[0] : r.game as any
      if (!g || g.league_id !== leagueId) continue
      const { home_team_id: ht, away_team_id: at } = g
      if (!ht || !at || !teamIds.has(ht) || !teamIds.has(at)) continue

      // Accumulate into the combined record always; into pool record for pool games.
      const input = {
        homeTeamId: ht, awayTeamId: at,
        homeScore: r.home_score, awayScore: r.away_score,
        sets: r.sets as { home: number; away: number }[] | null,
        isForfeit: r.is_forfeit, forfeitTeamId: r.forfeit_team_id,
      }
      accumulateGameResult(combinedRecords, input, isVb)
      if (g.pool_id) accumulateGameResult(poolRecords, input, isVb)
    }

    // Build a DisplayStanding for a team from its accumulated record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const build = (t: any, s: TeamStatTotals): DisplayStanding => ({
      rank: 0, team_id: t.id, name: t.name, color: t.color ?? null,
      logo_url: t.logo_url ?? null, pool_id: t.pool_id ?? null,
      played: s.matchesPlayed, won: s.wins, lost: s.losses, drawn: s.ties,
      gf: s.pointsFor, ga: s.pointsAgainst, setWins: s.setWins, setLosses: s.setLosses,
      pts: s.wins * 3 + s.ties,
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
    standings = rankSorted((teamsData ?? []).map((t: any) => build(t, combinedRecords.get(t.id) ?? emptyTeamStat())))

    // ── Pool-play standings (pool teams only, pool games only), ranked within each pool ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolRaw = (teamsData ?? []).filter((t: any) => t.pool_id).map((t: any) => build(t, poolRecords.get(t.id) ?? emptyTeamStat()))
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


    const { data: configRow } = await db
      .from('playoff_configs')
      .select('id')
      .eq('league_id', leagueId)
      .eq('organization_id', orgId)
      .maybeSingle() as { data: { id: string } | null }

    if (configRow) {

      const { data: tiersData } = await db
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

      const { data: bracketRow } = await db
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

      const fetchMatches = async (bracketId: string): Promise<DisplayBracketMatch[]> => {

        const { data: matchesData } = await db
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

  // ── Sponsors (banner / sponsors zone) ────────────────────────────────────────
  let sponsors: DisplayData['sponsors'] = []
  if (needsSponsors) {
    const resolved = await getEventSponsors(leagueId, orgId)
    sponsors = resolved
      .filter((s) => s.logo_url || s.ad_image_url)  // need at least a logo (banner/zone) or an ad (interstitial)
      .map((s) => ({ id: s.id, name: s.name, logo_url: s.logo_url, ad_image_url: s.ad_image_url, tier: s.tier }))
  }

  // ── Showcase (bios + photos) ─────────────────────────────────────────────────
  // Bios: players registered in THIS event who opted in on their profile
  // (show_on_displays) and aren't admin-hidden. Photos: the event's approved
  // gallery. Both re-read on the display's refresh cycle, so a photo approved
  // courtside joins the rotation within a minute.
  const showcase: DisplayData['showcase'] = { bios: [], photos: [] }
  if (needsShowcase) {
    const showcaseZone = config.zones.find((z) => z.type === 'showcase') as Extract<ZoneConfig, { type: 'showcase' }> | undefined
    const wantBios = showcaseZone?.source !== 'photos'
    const wantPhotos = showcaseZone?.source !== 'bios'

    if (wantPhotos) {
      const { data: media } = await db
        .from('event_media')
        .select('cloudinary_url, thumbnail_url, caption, media_type')
        .eq('league_id', leagueId).eq('organization_id', orgId)
        .eq('status', 'approved')
        .eq('media_type', 'image') // photos only in v1 — video risks buffering on gym wifi
        .order('created_at', { ascending: false })
        .limit(60)
      showcase.photos = (media ?? []).map((m) => ({ url: m.cloudinary_url, caption: m.caption ?? null }))
    }

    if (wantBios) {
      // Registrants of this event with an opted-in bio
      const { data: regs } = await db
        .from('registrations')
        .select('user_id')
        .eq('league_id', leagueId).eq('organization_id', orgId)
        .eq('status', 'active')
        .not('user_id', 'is', null)
      const regUserIds = [...new Set((regs ?? []).map((r) => r.user_id as string))]
      if (regUserIds.length > 0) {
        const [{ data: bios }, { data: profiles }, { data: memberships }, { data: medalRows }] = await Promise.all([
          db.from('player_bios')
            .select('user_id, hero_photo_url, jersey_number, position, hometown, years_playing, tagline')
            .eq('organization_id', orgId)
            .eq('show_on_displays', true)
            .eq('hidden_by_admin', false)
            .in('user_id', regUserIds),
          db.from('profiles').select('id, full_name, avatar_url').in('id', regUserIds),
          db.from('team_members')
            .select('user_id, position, team:teams!team_members_team_id_fkey(name, league_id)')
            .in('user_id', regUserIds)
            .eq('status', 'active'),
          db.from('medal_recipients')
            .select('user_id, medal:medals!medal_recipients_medal_id_fkey(placement)')
            .eq('organization_id', orgId)
            .in('user_id', regUserIds),
        ])

        const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
        // Team name for THIS league only
        const teamByUser = new Map<string, { name: string; position: string | null }>()
        for (const m of memberships ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const team = Array.isArray(m.team) ? m.team[0] : m.team as any
          if (team?.league_id === leagueId && m.user_id) teamByUser.set(m.user_id, { name: team.name, position: m.position ?? null })
        }
        const shelfCounts = new Map<string, Record<string, number>>()
        for (const r of medalRows ?? []) {
          if (!r.user_id) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const medal = Array.isArray(r.medal) ? r.medal[0] : r.medal as any
          if (!medal?.placement) continue
          const c = shelfCounts.get(r.user_id) ?? {}
          c[medal.placement] = (c[medal.placement] ?? 0) + 1
          shelfCounts.set(r.user_id, c)
        }
        const shelfFor = (userId: string): string | null => {
          const c = shelfCounts.get(userId)
          if (!c) return null
          const bits = ([['gold', '🥇'], ['silver', '🥈'], ['bronze', '🥉'], ['tier_champion', '🏆']] as const)
            .map(([k, g]) => { const n = c[k] ?? 0; return n > 0 ? g.repeat(Math.min(n, 3)) + (n > 3 ? `×${n}` : '') : '' })
            .filter(Boolean)
          return bits.length > 0 ? bits.join(' ') : null
        }

        showcase.bios = (bios ?? []).map((b) => {
          const profile = profileById.get(b.user_id)
          const team = teamByUser.get(b.user_id)
          return {
            name: profile?.full_name ?? 'Player',
            photoUrl: b.hero_photo_url ?? profile?.avatar_url ?? null,
            teamName: team?.name ?? null,
            position: b.position ?? team?.position ?? null,
            jerseyNumber: b.jersey_number,
            hometown: b.hometown,
            yearsPlaying: b.years_playing,
            tagline: b.tagline,
            medalShelf: shelfFor(b.user_id),
          }
        })
      }
    }
  }

  return {
    league:   { id: leagueRow?.id ?? leagueId, name: leagueRow?.name ?? '', sport: leagueRow?.sport ?? '' },
    org:      { name: orgRow?.name ?? '', logo_url: brandingRow?.logo_url ?? null },
    sponsors,
    timezone,
    pools:    (poolsData ?? []) as { id: string; name: string }[],
    games,
    standings,
    poolStandings,
    standingsConfig: { ptsMethod, volleyballMode },
    bracket,
    live: liveStream,
    showcase,
  }
}

// ── List all screen numbers that have a config saved ─────────────────────────

export async function getDisplayScreens(
  leagueId: string,
): Promise<{ screen_number: number; enabled: boolean }[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('event_display_configs')
    .select('screen_number, enabled')
    .eq('league_id', leagueId)
    .order('screen_number') as { data: { screen_number: number; enabled: boolean }[] | null }
  return data ?? []
}

