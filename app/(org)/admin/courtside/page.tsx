import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getAdminScope } from '@/lib/admin-scope'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { parseLocalToUtc } from '@/lib/format-time'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { TeamAvatar } from '@/components/ui/team-avatar'

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
        </div>
      )}
    </div>
  )

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

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white px-4 py-10 text-center text-sm text-gray-400">
          No games scheduled this day.
        </p>
      )}

      {unscored.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Needs a score · {unscored.length}</p>
          {unscored.map((g) => <GameCard key={g.id} g={g} />)}
        </div>
      )}
      {scored.length > 0 && (
        <div className="space-y-3 mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scored · {scored.length}</p>
          {scored.map((g) => <GameCard key={g.id} g={g} />)}
        </div>
      )}
    </div>
  )
}
