import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { formatGameTime } from '@/lib/format-time'
import { CaptainScoreEntry } from '@/components/scores/captain-score-entry'

export default async function SchedulePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url, timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Load all games for the org — no date filter so past games show too
  const { data: games } = await supabase
    .from('games')
    .select(`
      id, scheduled_at, court, status, week_number, league_id,
      home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(id, name, slug, sport),
      game_results(home_score, away_score, status, submitted_by, sets)
    `)
    .eq('organization_id', org.id)
    .order('scheduled_at', { ascending: true })
    .limit(200)

  // Fetch current user's captain team IDs (if logged in)
  const captainTeamIds = new Set<string>()
  if (user) {
    const { data: captainships } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('role', 'captain')
      .eq('status', 'active')
    for (const c of captainships ?? []) captainTeamIds.add(c.team_id)
  }

  const now = new Date()
  const allGames = games ?? []

  // Group by date string (in org timezone)
  type GameRow = NonNullable<typeof allGames>[number]
  const byDate = new Map<string, GameRow[]>()

  for (const game of allGames) {
    const { date } = formatGameTime(game.scheduled_at, timezone)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(game)
  }

  const dateGroups = Array.from(byDate.entries())

  // Separate into upcoming and past based on scheduled_at
  const upcomingGroups = dateGroups.filter(([, g]) =>
    new Date(g[0].scheduled_at) >= now
  )
  const pastGroups = dateGroups.filter(([, g]) =>
    new Date(g[0].scheduled_at) < now
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold uppercase mb-6 sm:mb-8" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Schedule
        </h1>

        {allGames.length === 0 ? (
          <p className="text-gray-500 text-center py-16">No games scheduled yet.</p>
        ) : (
          <div className="space-y-10">
            {/* Upcoming */}
            {upcomingGroups.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Upcoming</h2>
                <div className="space-y-6">
                  {upcomingGroups.map(([date, dayGames]) => (
                    <DateGroup key={date} date={date} games={dayGames} timezone={timezone} isPast={false} captainTeamIds={captainTeamIds} userId={user?.id ?? null} />
                  ))}
                </div>
              </section>
            )}

            {/* Past results */}
            {pastGroups.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Results</h2>
                <div className="space-y-6">
                  {[...pastGroups].reverse().map(([date, dayGames]) => (
                    <DateGroup key={date} date={date} games={dayGames} timezone={timezone} isPast captainTeamIds={captainTeamIds} userId={user?.id ?? null} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}

type SetScore = { home: number; away: number }

type AnyGame = {
  id: string
  scheduled_at: string
  court: string | null
  status: string
  week_number: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_team: { id: string; name: string } | { id: string; name: string }[] | null
  away_team: { id: string; name: string } | { id: string; name: string }[] | null
  league: { name: string; sport?: string } | { name: string; sport?: string }[] | null
  game_results: { home_score: number | null; away_score: number | null; status: string; submitted_by: string | null; sets?: SetScore[] | null } | { home_score: number | null; away_score: number | null; status: string; submitted_by: string | null; sets?: SetScore[] | null }[] | null
}

function DateGroup({ date, games, timezone, isPast, captainTeamIds, userId }: {
  date: string
  games: AnyGame[]
  timezone: string
  isPast: boolean
  captainTeamIds: Set<string>
  userId: string | null
}) {
  return (
    <div>
      <p className={`text-sm font-semibold mb-2 ${isPast ? 'text-gray-400' : 'text-gray-700'}`}>{date}</p>
      <div className="space-y-2">
        {games.map((game) => {
          const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
          const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
          const league = Array.isArray(game.league) ? game.league[0] : game.league
          const result = Array.isArray(game.game_results) ? game.game_results[0] : game.game_results
          const { time: gameTime } = formatGameTime(game.scheduled_at, timezone)

          const homeTeamId = homeTeam?.id ?? game.home_team_id ?? ''
          const awayTeamId = awayTeam?.id ?? game.away_team_id ?? ''
          const isCaptainOfHome = captainTeamIds.has(homeTeamId)
          const isCaptainOfAway = captainTeamIds.has(awayTeamId)
          const isCaptain = isCaptainOfHome || isCaptainOfAway

          // Determine if the opposing captain submitted (so this captain can confirm)
          const submittedByOpponent = result?.submitted_by != null && result.submitted_by !== userId

          return (
            <div
              key={game.id}
              className={`bg-white rounded-lg border p-4 ${isPast ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center gap-4">
                {/* Time */}
                <div className="w-16 shrink-0 text-xs text-gray-400 tabular-nums">{gameTime}</div>

                {/* Matchup */}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isPast ? 'text-gray-500' : ''}`}>
                    {homeTeam?.name ?? 'TBD'}
                    <span className="mx-2 font-normal text-gray-400 text-sm">vs</span>
                    {awayTeam?.name ?? 'TBD'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    {league && <span>{(league as { name: string }).name}</span>}
                    {game.court && <><span>·</span><span>Court {game.court}</span></>}
                    {game.week_number && <><span>·</span><span>Wk {game.week_number}</span></>}
                  </div>
                </div>

                {/* Score or status */}
                <div className="shrink-0 text-right">
                  {result && result.home_score !== null && result.away_score !== null ? (
                    <div>
                      <p className="font-bold tabular-nums text-sm">
                        {result.home_score} – {result.away_score}
                      </p>
                      {result.sets && result.sets.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {result.sets.map((s: SetScore) => `${s.home}–${s.away}`).join(', ')}
                        </p>
                      )}
                      {result.status === 'confirmed' ? (
                        <p className="text-[10px] text-green-600 mt-0.5">✓ confirmed</p>
                      ) : (
                        <p className="text-[10px] text-amber-600 mt-0.5">pending</p>
                      )}
                    </div>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      game.status === 'completed'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-blue-50 text-blue-600'
                    }`}>
                      {game.status === 'completed' ? 'Final' : game.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Captain score entry — only for past games where user is a captain */}
              {isPast && isCaptain && result?.status !== 'confirmed' && (
                <CaptainScoreEntry
                  gameId={game.id}
                  sport={(league as { sport?: string } | null)?.sport}
                  homeTeamName={homeTeam?.name ?? 'Home'}
                  awayTeamName={awayTeam?.name ?? 'Away'}
                  isCaptainOfHome={isCaptainOfHome}
                  isCaptainOfAway={isCaptainOfAway}
                  existingResult={result ? {
                    homeScore: result.home_score,
                    awayScore: result.away_score,
                    status: result.status,
                    submittedByOpponent,
                    sets: result.sets ?? null,
                  } : null}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
