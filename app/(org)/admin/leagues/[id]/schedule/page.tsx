import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { AddGameForm } from '@/components/schedule/add-game-form'
import { ScheduleImport } from '@/components/schedule/schedule-import'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { formatGameTime } from '@/lib/format-time'

export default async function AdminSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: branding } = await supabase
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  const [{ data: games }, { data: teams }] = await Promise.all([
    supabase
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        game_results(home_score, away_score, status)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('teams')
      .select('id, name')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('name'),
  ])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Game list */}
      <div className="md:col-span-2">
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Wk</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date & Time</th>
                <th className="px-4 py-3 font-medium text-gray-500">Matchup</th>
                <th className="px-4 py-3 font-medium text-gray-500">Court</th>
                <th className="px-4 py-3 font-medium text-gray-500">Score</th>
              </tr>
            </thead>
            <tbody>
              {games && games.length > 0 ? (
                games.map((game) => {
                  const home = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
                  const away = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
                  const result = Array.isArray(game.game_results) ? game.game_results[0] : game.game_results
                  const { date: gameDate, time: gameTime } = formatGameTime(game.scheduled_at, timezone)

                  return (
                    <tr key={game.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{game.week_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-700">{gameDate}</div>
                        <div className="text-xs text-gray-400">{gameTime}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {home?.name ?? 'TBD'}{' '}
                        <span className="text-gray-400 font-normal text-xs">vs</span>{' '}
                        {away?.name ?? 'TBD'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{game.court ?? '—'}</td>
                      <td className="px-4 py-3">
                        <AdminScoreEntry
                          gameId={game.id}
                          leagueId={id}
                          homeTeamName={home?.name ?? 'Home'}
                          awayTeamName={away?.name ?? 'Away'}
                          existingResult={result ? {
                            homeScore: result.home_score,
                            awayScore: result.away_score,
                            status: result.status,
                          } : null}
                        />
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    No games scheduled yet. Add a game or import from CSV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Sidebar tools */}
      <div className="space-y-4">
        <AddGameForm leagueId={id} teams={teams ?? []} />
        <ScheduleImport leagueId={id} />
      </div>
    </div>
  )
}
