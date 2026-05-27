import type { DisplayGame, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'

interface Props {
  games: DisplayGame[]
  config: Extract<ZoneConfig, { type: 'schedule' }>
  timezone: string
  theme: 'dark' | 'light'
  pools: { id: string; name: string }[]
}

function fmtTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  }).format(new Date(iso))
}

function fmtDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone,
  }).format(new Date(iso))
}

export function ScheduleZone({ games, config, timezone, theme, pools }: Props) {
  const isDark = theme === 'dark'

  // Filter by pool if configured
  const filtered = config.pool_id
    ? games.filter((g) => g.pool_id === config.pool_id)
    : games

  // Filter by court if configured
  const visible = config.court_filter
    ? filtered.filter((g) => g.court === config.court_filter)
    : filtered

  const poolName = config.pool_id
    ? pools.find((p) => p.id === config.pool_id)?.name
    : null

  // Group by date+time for display
  const grouped = new Map<string, DisplayGame[]>()
  for (const g of visible) {
    const key = fmtTime(g.scheduled_at, timezone)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(g)
  }

  const headerText = poolName
    ? `Schedule — ${poolName}`
    : config.court_filter
    ? `Schedule — ${config.court_filter}`
    : 'Schedule'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Zone header */}
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {headerText}
        </h2>
      </div>

      {/* Games list */}
      {visible.length === 0 ? (
        <div className={`flex items-center justify-center flex-1 text-lg ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          No games scheduled
        </div>
      ) : (
        <FitContent>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {visible.map((g, i) => {
                const isComplete  = g.result_status === 'confirmed'
                const isCancelled = g.game_status === 'cancelled'
                const isPostponed = g.game_status === 'postponed'
                const isLive      = !isComplete && !isCancelled && !isPostponed

                return (
                  <tr
                    key={g.id}
                    className={`border-b transition-colors ${
                      isDark
                        ? i % 2 === 0 ? 'bg-zinc-900/40 border-zinc-800' : 'bg-transparent border-zinc-800'
                        : i % 2 === 0 ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'
                    }`}
                  >
                    {/* Time + Court */}
                    <td className={`px-3 py-2.5 whitespace-nowrap ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                      <div className="font-semibold text-sm">{fmtTime(g.scheduled_at, timezone)}</div>
                      {g.court && <div className="text-xs mt-0.5 opacity-70">{g.court}</div>}
                    </td>

                    {/* Home team */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        {g.home_color && (
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.home_color }} />
                        )}
                        <span className={`font-semibold leading-tight ${
                          isComplete && g.home_score !== null && g.away_score !== null && g.home_score > g.away_score
                            ? 'text-white'
                            : isDark ? 'text-zinc-200' : 'text-gray-800'
                        }`}>
                          {g.home_name}
                        </span>
                      </div>
                    </td>

                    {/* Score / VS */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {isCancelled ? (
                        <span className="text-xs font-semibold bg-red-500/20 text-red-400 px-2 py-0.5 rounded">CANCELLED</span>
                      ) : isPostponed ? (
                        <span className="text-xs font-semibold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">POSTPONED</span>
                      ) : isComplete ? (
                        <span className={`text-xl font-bold tabular-nums ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {g.home_score} – {g.away_score}
                        </span>
                      ) : (
                        <span className={`text-sm font-medium ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>vs</span>
                      )}
                    </td>

                    {/* Away team */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        {g.away_color && (
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.away_color }} />
                        )}
                        <span className={`font-semibold leading-tight ${
                          isComplete && g.home_score !== null && g.away_score !== null && g.away_score > g.home_score
                            ? 'text-white'
                            : isDark ? 'text-zinc-200' : 'text-gray-800'
                        }`}>
                          {g.away_name}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </FitContent>
      )}
    </div>
  )
}
