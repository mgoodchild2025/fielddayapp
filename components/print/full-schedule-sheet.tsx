import { formatGameTime } from '@/lib/format-time'
import { venueLabel } from '@/lib/venue-label'

interface Game {
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  homeTeamName: string
  awayTeamName: string
  /** When printing a team schedule, mark which side is "my team" */
  highlightHome?: boolean
  highlightAway?: boolean
}

interface Props {
  games: Game[]
  leagueName: string
  orgName: string
  timezone: string
  sport?: string
  /** When set, shown as a subtitle and omits score boxes (team reference view) */
  teamName?: string
}

/** Group games by calendar date in the given timezone. */
function groupByDate(
  games: Game[],
  timezone: string,
): { dateLabel: string; games: Game[] }[] {
  const map = new Map<string, { dateLabel: string; games: Game[] }>()
  const fmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: timezone,
  })
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }) // YYYY-MM-DD
  for (const g of games) {
    const d = new Date(g.scheduledAt)
    const key = keyFmt.format(d)
    if (!map.has(key)) map.set(key, { dateLabel: fmt.format(d), games: [] })
    map.get(key)!.games.push(g)
  }
  return Array.from(map.values())
}

export function FullScheduleSheet({ games, leagueName, orgName, timezone, sport, teamName }: Props) {
  const dateGroups = groupByDate(games, timezone)
  const venueLbl = venueLabel(sport)
  const isTeamView = !!teamName
  const generatedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone,
  }).format(new Date())

  return (
    <div className="font-sans text-black text-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-xl font-bold leading-tight">{leagueName}</h1>
          {teamName && (
            <p className="text-sm font-semibold text-gray-700 mt-0.5">{teamName} — Team Schedule</p>
          )}
          {!teamName && (
            <p className="text-sm text-gray-500 mt-0.5">Complete Schedule</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">
            {games.length} game{games.length !== 1 ? 's' : ''} · {dateGroups.length} day{dateGroups.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Printed {generatedDate}</p>
        </div>
      </div>

      <hr className="border-black mb-4" />

      {dateGroups.length === 0 && (
        <p className="text-center text-gray-400 italic py-12">No games scheduled.</p>
      )}

      {/* One section per date */}
      {dateGroups.map(({ dateLabel, games: dayGames }, i) => (
        <div key={dateLabel} className={i > 0 ? 'mt-6' : ''}>
          {/* Date header */}
          <div className="flex items-center gap-3 mb-1.5">
            <p className="font-bold text-sm">{dateLabel}</p>
            <span className="text-xs text-gray-400">{dayGames.length} game{dayGames.length !== 1 ? 's' : ''}</span>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800 text-xs text-gray-600">
                <th className="text-left py-1 pr-3 font-semibold w-16">Time</th>
                <th className="text-left py-1 pr-3 font-semibold w-14">{venueLbl}</th>
                {!isTeamView && <th className="text-center py-1 px-2 font-semibold w-6">Wk</th>}
                {isTeamView
                  ? <th className="text-left py-1 font-semibold">Opponent</th>
                  : <th className="text-left py-1 pr-3 font-semibold">Home</th>
                }
                {!isTeamView && (
                  <th className="text-center py-1 px-3 font-semibold w-24">Score</th>
                )}
                {!isTeamView && (
                  <th className="text-right py-1 pl-3 font-semibold">Away</th>
                )}
              </tr>
            </thead>
            <tbody>
              {dayGames.map((game) => {
                const { time } = formatGameTime(game.scheduledAt, timezone)
                const homeStyle = game.highlightHome ? 'font-bold' : ''
                const awayStyle = game.highlightAway ? 'font-bold' : ''

                if (isTeamView) {
                  // Team view: show as "vs Opponent" or "@ Opponent"
                  const isHome = game.highlightHome
                  const opponent = isHome ? game.awayTeamName : game.homeTeamName
                  const vsLabel = isHome ? 'vs' : '@'
                  return (
                    <tr key={game.id} className="border-b border-gray-200">
                      <td className="py-2 pr-3 font-medium tabular-nums">{time}</td>
                      <td className="py-2 pr-3 text-gray-600">{game.court ?? '—'}</td>
                      <td className="py-2 pr-3 font-medium">
                        <span className="text-gray-500 mr-1.5 text-xs">{vsLabel}</span>
                        {opponent}
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={game.id} className="border-b border-gray-200">
                    <td className="py-2 pr-3 font-medium tabular-nums">{time}</td>
                    <td className="py-2 pr-3 text-gray-500">{game.court ?? '—'}</td>
                    <td className="py-2 px-2 text-center text-gray-500 text-xs">{game.weekNumber ?? '—'}</td>
                    <td className={`py-2 pr-3 ${homeStyle}`}>{game.homeTeamName}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="inline-block w-8 h-6 border border-black rounded text-center text-xs leading-6" />
                        <span className="text-gray-400">–</span>
                        <span className="inline-block w-8 h-6 border border-black rounded text-center text-xs leading-6" />
                      </div>
                    </td>
                    <td className={`py-2 pl-3 text-right ${awayStyle}`}>{game.awayTeamName}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Footer */}
      <p className="text-[10px] text-gray-400 text-center mt-8 pt-4 border-t border-gray-200">
        {orgName} · {leagueName}{teamName ? ` · ${teamName}` : ''} · Generated by Fieldday
      </p>
    </div>
  )
}
