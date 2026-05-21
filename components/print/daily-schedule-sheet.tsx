import { formatGameTime } from '@/lib/format-time'

interface Game {
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  homeTeamName: string
  awayTeamName: string
}

interface Props {
  games: Game[]
  date: string        // YYYY-MM-DD (display only)
  leagueName: string
  orgName: string
  timezone: string
  sport?: string
}

/** Single score entry box for one team in one period */
function ScoreBox() {
  return <span className="inline-block w-16 h-8 border-2 border-black rounded" />
}

export function DailyScheduleSheet({ games, date, leagueName, orgName, timezone, sport }: Props) {
  const isVolleyball = sport === 'volleyball' || sport === 'beach_volleyball'
  const setCount = sport === 'beach_volleyball' ? 3 : isVolleyball ? 5 : 0
  // Show up to 3 set columns on the daily sheet (enough for match result; extra sets rare)
  const sheetSets = Math.min(setCount, 3)
  const showSets = sheetSets > 0

  // Format the date as a long readable string for the header
  const dateDisplay = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00`))  // noon to avoid DST edge

  const colSpanTotal = 3 + (showSets ? sheetSets : 1)

  return (
    <div className="font-sans text-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-xl font-bold leading-tight">{leagueName}</h1>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold">{dateDisplay}</p>
          <p className="text-xs text-gray-500">{games.length} game{games.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <hr className="border-black mb-3" />

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-1.5 pr-3 font-semibold w-14">Time</th>
            <th className="text-left py-1.5 pr-3 font-semibold w-12">Court</th>
            <th className="text-left py-1.5 pr-4 font-semibold">Team</th>
            {showSets ? (
              Array.from({ length: sheetSets }, (_, i) => (
                <th key={i} className="text-center py-1.5 px-2 font-semibold w-14">
                  Set {i + 1}
                </th>
              ))
            ) : (
              <th className="text-center py-1.5 px-3 font-semibold w-16">Score</th>
            )}
          </tr>
        </thead>
        <tbody>
          {games.length === 0 ? (
            <tr>
              <td colSpan={colSpanTotal} className="py-8 text-center text-gray-400 italic">
                No games scheduled for this day.
              </td>
            </tr>
          ) : (
            games.map((game) => {
              const { time } = formatGameTime(game.scheduledAt, timezone)
              return (
                <>
                  {/* Home team row */}
                  <tr key={`${game.id}-home`} className="border-t-2 border-black">
                    <td
                      rowSpan={2}
                      className="pr-3 font-medium tabular-nums align-middle text-sm"
                      style={{ verticalAlign: 'middle' }}
                    >
                      {time}
                    </td>
                    <td
                      rowSpan={2}
                      className="pr-3 text-gray-600 align-middle"
                      style={{ verticalAlign: 'middle' }}
                    >
                      {game.court ?? '—'}
                    </td>
                    <td className="pt-2 pb-1 pr-4 font-medium">{game.homeTeamName}</td>
                    {showSets ? (
                      Array.from({ length: sheetSets }, (_, i) => (
                        <td key={i} className="pt-2 pb-1 px-2 text-center">
                          <ScoreBox />
                        </td>
                      ))
                    ) : (
                      <td className="pt-2 pb-1 px-3 text-center"><ScoreBox /></td>
                    )}
                  </tr>
                  {/* Away team row */}
                  <tr key={`${game.id}-away`}>
                    <td className="pt-1 pb-2.5 pr-4 font-medium text-gray-600">{game.awayTeamName}</td>
                    {showSets ? (
                      Array.from({ length: sheetSets }, (_, i) => (
                        <td key={i} className="pt-1 pb-2.5 px-2 text-center">
                          <ScoreBox />
                        </td>
                      ))
                    ) : (
                      <td className="pt-1 pb-2.5 px-3 text-center"><ScoreBox /></td>
                    )}
                  </tr>
                </>
              )
            })
          )}
        </tbody>
      </table>

      {/* Referee signature line */}
      <div className="mt-8 pt-4 border-t border-gray-400">
        <div className="flex items-end gap-8">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Referee (print name)</p>
            <div className="border-b border-black h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Referee signature</p>
            <div className="border-b border-black h-6" />
          </div>
          <div className="w-28">
            <p className="text-xs text-gray-500 mb-1">Date</p>
            <div className="border-b border-black h-6" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-gray-400 text-center mt-6">
        {orgName} · {leagueName} · Generated by Fieldday
      </p>
    </div>
  )
}
