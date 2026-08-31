import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getAdminScope } from '@/lib/admin-scope'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { parseLocalToUtc } from '@/lib/format-time'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { roundDisplayName } from '@/lib/bracket'

/**
 * Courtside mode — game-night score entry built for a phone in a dim gym:
 * one day's games as big cards, unscored first, each opening the existing
 * score sheet (all sport scoring modes) full-width. Day arrows hop between
 * game nights.
 */
export default async function CourtsidePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const scope = await getAdminScope(org.id)
  const db = createServiceRoleClient()

  const { data: branding } = await db
    .from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle()
  const tz = branding?.timezone ?? 'America/Toronto'

  const params = await searchParams
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayLocal

  // Local-day bounds in UTC (DST-safe via the shared helper)
  const dayStart = parseLocalToUtc(date, '00:00', tz)
  const nextDate = new Date(`${date}T12:00:00Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const nextDateStr = nextDate.toISOString().slice(0, 10)
  const prevDate = new Date(`${date}T12:00:00Z`)
  prevDate.setUTCDate(prevDate.getUTCDate() - 1)
  const prevDateStr = prevDate.toISOString().slice(0, 10)
  const dayEnd = parseLocalToUtc(nextDateStr, '00:00', tz)

  let query = db
    .from('games')
    .select(`
      id, scheduled_at, court, status, league_id,
      home_team:teams!games_home_team_id_fkey(id, name, color, logo_url),
      away_team:teams!games_away_team_id_fkey(id, name, color, logo_url),
      league:leagues!games_league_id_fkey(id, name, sport),
      game_results(home_score, away_score, status, sets)
    `)
    .eq('organization_id', org.id)
    .neq('status', 'cancelled')
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .order('scheduled_at', { ascending: true })
  if (!scope.isOrgAdmin && scope.assignedLeagueIds !== null) {
    query = query.in('league_id', scope.assignedLeagueIds.length > 0 ? scope.assignedLeagueIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data: games } = await query

  // Playoff bracket matches aren't games rows — pull the day's scheduled ones
  // too (both teams decided, byes excluded) so playoff night has a courtside.
  const { data: bracketMatchesRaw } = await db
    .from('bracket_matches')
    .select(`
      id, scheduled_at, court, status, round_number, match_number, score1, score2,
      team1:teams!bracket_matches_team1_id_fkey(id, name, color, logo_url),
      team2:teams!bracket_matches_team2_id_fkey(id, name, color, logo_url),
      bracket:brackets!bracket_matches_bracket_id_fkey(id, name, league_id, bracket_size, round_names)
    `)
    .eq('organization_id', org.id)
    .eq('is_bye', false)
    .not('scheduled_at', 'is', null)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .order('scheduled_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bracketRows = ((bracketMatchesRaw ?? []) as any[])
    .map((m) => ({
      ...m,
      team1: Array.isArray(m.team1) ? m.team1[0] : m.team1,
      team2: Array.isArray(m.team2) ? m.team2[0] : m.team2,
      bracket: Array.isArray(m.bracket) ? m.bracket[0] : m.bracket,
    }))
    .filter((m) =>
      scope.isOrgAdmin || scope.assignedLeagueIds === null
        ? true
        : scope.assignedLeagueIds.includes(m.bracket?.league_id)
    )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((games ?? []) as any[]).map((g) => {
    const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
    const home = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const away = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    const league = Array.isArray(g.league) ? g.league[0] : g.league
    return { ...g, result: result ?? null, home, away, league }
  })
  // Unscored first — that's what courtside is for; scored games sink below.
  const unscored = rows.filter((g) => !g.result || g.result.home_score === null)
  const scored = rows.filter((g) => g.result && g.result.home_score !== null)
  const bracketUnscored = bracketRows.filter((m) => m.status !== 'completed')
  const bracketScored = bracketRows.filter((m) => m.status === 'completed')

  // Merge games + playoff matches into one time-sorted list per section.
  type Item = { kind: 'game'; when: string; row: (typeof rows)[number] } | { kind: 'bracket'; when: string; row: (typeof bracketRows)[number] }
  const merge = (gs: typeof rows, bs: typeof bracketRows): Item[] =>
    [
      ...gs.map((g) => ({ kind: 'game' as const, when: g.scheduled_at as string, row: g })),
      ...bs.map((m) => ({ kind: 'bracket' as const, when: m.scheduled_at as string, row: m })),
    ].sort((x, y) => x.when.localeCompare(y.when))
  const unscoredItems = merge(unscored, bracketUnscored)
  const scoredItems = merge(scored, bracketScored)

  const timeStr = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(new Date(iso))
  const dayLabel = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GameCard = ({ g }: { g: any }) => (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
        <span>{timeStr(g.scheduled_at)}{g.court ? ` · ${g.court}` : ''}</span>
        <span className="truncate max-w-[45%]">{g.league?.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamAvatar logoUrl={g.home?.logo_url ?? null} color={g.home?.color ?? null} name={g.home?.name ?? 'TBD'} size="sm" />
          <span className="truncate text-sm font-semibold">{g.home?.name ?? 'TBD'}</span>
        </div>
        <span className="shrink-0 px-2 text-lg font-bold tabular-nums">
          {g.result && g.result.home_score !== null ? `${g.result.home_score} – ${g.result.away_score}` : 'vs'}
        </span>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
          <span className="truncate text-sm font-semibold">{g.away?.name ?? 'TBD'}</span>
          <TeamAvatar logoUrl={g.away?.logo_url ?? null} color={g.away?.color ?? null} name={g.away?.name ?? 'TBD'} size="sm" />
        </div>
      </div>
      {g.home && g.away && (
        <div className="mt-3">
          <AdminScoreEntry
            gameId={g.id}
            leagueId={g.league_id}
            sport={g.league?.sport ?? undefined}
            homeTeamName={g.home.name}
            awayTeamName={g.away.name}
            existingResult={g.result ? { homeScore: g.result.home_score, awayScore: g.result.away_score, status: g.result.status, sets: g.result.sets ?? null } : null}
            compact
          />
          <Link
            href={`/scoreboard?game=${g.id}`}
            className="mt-2 block text-center text-xs font-semibold text-gray-500 hover:text-gray-700 py-1.5"
          >
            🔢 Open scoreboard →
          </Link>
        </div>
      )}
    </div>
  )

  // Playoff bracket match card — scored through the scoreboard (which saves via
  // recordBracketScore and advances the winner through the bracket).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BracketCard = ({ m }: { m: any }) => (
    <div className="rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
        <span>{timeStr(m.scheduled_at)}{m.court ? ` · ${m.court}` : ''}</span>
        <span className="truncate max-w-[55%] text-amber-700 font-semibold">
          🏆 {m.bracket?.name} · {roundDisplayName(m.bracket?.round_names ?? null, m.round_number, m.bracket?.bracket_size ?? 0, m.match_number)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamAvatar logoUrl={m.team1?.logo_url ?? null} color={m.team1?.color ?? null} name={m.team1?.name ?? 'TBD'} size="sm" />
          <span className="truncate text-sm font-semibold">{m.team1?.name ?? 'TBD'}</span>
        </div>
        <span className="shrink-0 px-2 text-lg font-bold tabular-nums">
          {m.status === 'completed' && m.score1 !== null ? `${m.score1} – ${m.score2}` : 'vs'}
        </span>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
          <span className="truncate text-sm font-semibold">{m.team2?.name ?? 'TBD'}</span>
          <TeamAvatar logoUrl={m.team2?.logo_url ?? null} color={m.team2?.color ?? null} name={m.team2?.name ?? 'TBD'} size="sm" />
        </div>
      </div>
      <Link
        href={`/scoreboard?match=${m.id}`}
        className="mt-3 block text-center text-sm font-semibold rounded-lg border border-gray-200 py-2.5 text-gray-700 hover:bg-gray-50"
      >
        🔢 Open scoreboard →
      </Link>
    </div>
  )

  const renderItem = (item: (typeof unscoredItems)[number]) =>
    item.kind === 'game' ? <GameCard key={item.row.id} g={item.row} /> : <BracketCard key={item.row.id} m={item.row} />

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">Courtside</h1>
        <Link href="/admin/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
      </div>
      <div className="flex items-center justify-between mb-5">
        <Link href={`/admin/courtside?date=${prevDateStr}`} aria-label="Previous day"
          className="px-4 py-2 rounded-lg border bg-white text-gray-600 font-bold">‹</Link>
        <div className="text-center">
          <p className="text-sm font-semibold">{dayLabel}</p>
          {date !== todayLocal && (
            <Link href="/admin/courtside" className="text-xs underline" style={{ color: 'var(--brand-primary)' }}>Back to today</Link>
          )}
        </div>
        <Link href={`/admin/courtside?date=${nextDateStr}`} aria-label="Next day"
          className="px-4 py-2 rounded-lg border bg-white text-gray-600 font-bold">›</Link>
      </div>

      {rows.length === 0 && bracketRows.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white px-4 py-10 text-center text-sm text-gray-400">
          No games scheduled this day.
        </p>
      )}

      {unscoredItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Needs a score · {unscoredItems.length}</p>
          {unscoredItems.map(renderItem)}
        </div>
      )}
      {scoredItems.length > 0 && (
        <div className="space-y-3 mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scored · {scoredItems.length}</p>
          {scoredItems.map(renderItem)}
        </div>
      )}
    </div>
  )
}
