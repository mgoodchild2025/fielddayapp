import type { createServiceRoleClient } from '@/lib/supabase/service'
import { createNotifications } from '@/lib/notify'
import { isVolleyballSport } from '@/lib/standings'
import { buildWrapped, isWrappable, type SeasonWrapped, type WrappedGame, type WrappedInputs } from '@/lib/season-wrapped'

/**
 * Loading for Season Wrapped (one player, one event) and the "your season,
 * wrapped" alert. Not a server action: the page and image route pass the
 * SIGNED-IN user's id (a player only ever sees their own season), and the
 * alert runs from updateLeagueStatus after an admin completes the event.
 */

type Db = ReturnType<typeof createServiceRoleClient>
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export interface WrappedView {
  league: { id: string; name: string; slug: string; sport: string | null }
  playerName: string
  team: { id: string; name: string; color: string | null } | null
  wrapped: SeasonWrapped
}

/** A player's wrapped season for an event (by slug), or null: not finished, or they didn't play in it. */
export async function loadSeasonWrapped(db: Db, orgId: string, slug: string, userId: string): Promise<WrappedView | null> {
  const { data: league } = await db.from('leagues')
    .select('id, name, slug, sport, status')
    .eq('organization_id', orgId).eq('slug', slug).is('deleted_at', null)
    .maybeSingle()
  if (!league || !isWrappable(league.status)) return null

  const nowIso = new Date().toISOString()
  const [{ data: profile }, { data: teams }, { count: sessions }, { count: photos }, { data: reg }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    db.from('teams').select('id, name, color').eq('organization_id', orgId).eq('league_id', league.id),
    db.from('session_registrations')
      .select('id, event_sessions!inner(scheduled_at, status)', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('league_id', league.id).eq('user_id', userId)
      .eq('status', 'registered')
      .lt('event_sessions.scheduled_at', nowIso)
      .neq('event_sessions.status', 'cancelled'),
    db.from('event_media')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('league_id', league.id).eq('uploaded_by', userId).eq('status', 'approved'),
    db.from('registrations').select('id')
      .eq('organization_id', orgId).eq('league_id', league.id).eq('user_id', userId).eq('status', 'active').limit(1),
  ])
  const { count: kudos } = await db.from('kudos').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('league_id', league.id).eq('to_user_id', userId)

  const teamIds = (teams ?? []).map((t) => t.id)
  const { data: membership } = teamIds.length > 0
    ? await db.from('team_members').select('team_id')
        .eq('user_id', userId).in('team_id', teamIds).in('status', ['active', 'inactive']).limit(1)
    : { data: [] as { team_id: string }[] }
  const team = membership?.[0] ? (teams ?? []).find((t) => t.id === membership[0].team_id) ?? null : null

  if (!team && !(sessions && sessions > 0) && !(reg && reg.length > 0)) return null

  const games: WrappedGame[] = []
  let playoffs: { won: boolean }[] = []
  let medal: WrappedInputs['medal'] = null
  let teammates = 0
  if (team) {
    const nameOf = new Map((teams ?? []).map((t) => [t.id, t.name]))
    const [{ data: gameRows }, { data: bracketRows }, { data: medalRow }, { data: mates }] = await Promise.all([
      db.from('games')
        .select('scheduled_at, home_team_id, away_team_id, game_results!inner(home_score, away_score, status, is_forfeit)')
        .eq('organization_id', orgId).eq('league_id', league.id)
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .eq('game_results.status', 'confirmed'),
      db.from('bracket_matches')
        .select('winner_team_id, team1_id, team2_id, status, brackets!bracket_matches_bracket_id_fkey!inner(league_id)')
        .eq('organization_id', orgId)
        .eq('brackets.league_id', league.id)
        .or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`)
        .eq('status', 'completed')
        .eq('is_bye', false),
      db.from('medals').select('placement, label')
        .eq('organization_id', orgId).eq('league_id', league.id).eq('team_id', team.id)
        .order('awarded_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('team_members').select('user_id')
        .eq('team_id', team.id).in('status', ['active', 'inactive']).neq('user_id', userId),
    ])
    for (const g of gameRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = one((g as any).game_results) as { home_score: number | null; away_score: number | null; is_forfeit: boolean | null } | null
      if (!r || r.is_forfeit || r.home_score == null || r.away_score == null) continue
      const home = g.home_team_id === team.id
      games.push({
        at: g.scheduled_at,
        my: home ? r.home_score : r.away_score,
        their: home ? r.away_score : r.home_score,
        opponent: nameOf.get((home ? g.away_team_id : g.home_team_id) ?? '') ?? 'opponent',
      })
    }
    playoffs = (bracketRows ?? []).map((m) => ({ won: m.winner_team_id === team.id }))
    medal = medalRow ? { placement: medalRow.placement as 'gold' | 'silver' | 'bronze' | 'tier_champion', label: medalRow.label } : null
    teammates = new Set((mates ?? []).map((m) => m.user_id).filter(Boolean)).size
  }

  return {
    league: { id: league.id, name: league.name, slug: league.slug, sport: league.sport },
    playerName: profile?.full_name ?? 'Player',
    team: team ? { id: team.id, name: team.name, color: team.color } : null,
    wrapped: buildWrapped({
      setSport: isVolleyballSport(league.sport ?? null),
      games, playoffs, medal,
      sessions: sessions ?? 0,
      teammates,
      photos: photos ?? 0,
      kudos: kudos ?? 0,
    }),
  }
}

/**
 * "Your season, wrapped" — to everyone who played (team members, active
 * registrants, drop-in sign-ups), once per event. Called after an admin marks
 * the event completed. Never throws.
 */
export async function sendWrappedAlerts(db: Db, orgId: string, leagueId: string): Promise<void> {
  try {
    const { data: league } = await db.from('leagues').select('id, name, slug, status')
      .eq('id', leagueId).eq('organization_id', orgId).maybeSingle()
    if (!league || !isWrappable(league.status)) return

    const { data: already } = await db.from('notifications').select('id')
      .eq('organization_id', orgId).eq('type', 'season_wrapped').eq('data->>league_id', leagueId).limit(1)
    if (already && already.length > 0) return

    const { data: teams } = await db.from('teams').select('id').eq('organization_id', orgId).eq('league_id', leagueId)
    const teamIds = (teams ?? []).map((t) => t.id)
    const [{ data: members }, { data: regs }, { data: drops }] = await Promise.all([
      teamIds.length > 0
        ? db.from('team_members').select('user_id').in('team_id', teamIds).eq('status', 'active')
        : Promise.resolve({ data: [] as { user_id: string | null }[] }),
      db.from('registrations').select('user_id').eq('organization_id', orgId).eq('league_id', leagueId).eq('status', 'active'),
      db.from('session_registrations').select('user_id').eq('organization_id', orgId).eq('league_id', leagueId).eq('status', 'registered'),
    ])
    const userIds = new Set<string>()
    for (const r of [...(members ?? []), ...(regs ?? []), ...(drops ?? [])]) if (r.user_id) userIds.add(r.user_id)
    if (userIds.size === 0) return

    await createNotifications([...userIds].map((userId) => ({
      organization_id: orgId,
      user_id: userId,
      type: 'season_wrapped',
      title: `Your ${league.name} season, wrapped 🎬`,
      body: 'Your games, your streaks, your team. See your season and share it.',
      data: { league_id: leagueId, href: `/wrapped/${league.slug}`, link_label: 'See your season' },
    })))
  } catch (err) {
    console.error('[sendWrappedAlerts]', err)
  }
}
