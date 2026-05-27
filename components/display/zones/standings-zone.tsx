import type { DisplayStanding, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'

interface Props {
  standings: DisplayStanding[]
  config: Extract<ZoneConfig, { type: 'standings' }>
  theme: 'dark' | 'light'
  pools: { id: string; name: string }[]
}

export function StandingsZone({ standings, config, theme, pools }: Props) {
  const isDark = theme === 'dark'

  const poolName = config.pool_id
    ? pools.find((p) => p.id === config.pool_id)?.name
    : null

  const visible = config.pool_id
    ? standings.filter((s) => s.pool_id === config.pool_id)
    : standings

  // Re-rank after pool filter
  const ranked = visible.map((s, i) => ({ ...s, rank: i + 1 }))

  const headerText = poolName ? `Standings — ${poolName}` : 'Standings'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {headerText}
        </h2>
      </div>

      {ranked.length === 0 ? (
        <div className={`flex items-center justify-center flex-1 text-lg ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          No standings yet
        </div>
      ) : (
        <FitContent>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`text-xs ${isDark ? 'text-zinc-500 border-zinc-700' : 'text-gray-400 border-gray-200'} border-b`}>
                <th className="px-3 py-1.5 text-left w-8">#</th>
                <th className="px-2 py-1.5 text-left">Team</th>
                <th className="px-3 py-1.5 text-center">GP</th>
                <th className="px-3 py-1.5 text-center">W</th>
                <th className="px-3 py-1.5 text-center">L</th>
                <th className="px-3 py-1.5 text-center">D</th>
                <th className="px-3 py-1.5 text-center font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr
                  key={s.team_id}
                  className={`border-b ${
                    isDark
                      ? i % 2 === 0 ? 'bg-zinc-900/40 border-zinc-800' : 'bg-transparent border-zinc-800'
                      : i % 2 === 0 ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'
                  }`}
                >
                  <td className={`px-3 py-2 text-sm font-bold ${
                    s.rank === 1 ? 'text-amber-400' :
                    s.rank === 2 ? 'text-zinc-300' :
                    s.rank === 3 ? 'text-amber-600' :
                    isDark ? 'text-zinc-500' : 'text-gray-400'
                  }`}>
                    {s.rank}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {s.color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />}
                      <span className={`font-semibold ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{s.name}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-center tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{s.played}</td>
                  <td className={`px-3 py-2 text-center tabular-nums font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{s.won}</td>
                  <td className={`px-3 py-2 text-center tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{s.lost}</td>
                  <td className={`px-3 py-2 text-center tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{s.drawn}</td>
                  <td className={`px-3 py-2 text-center tabular-nums text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FitContent>
      )}
    </div>
  )
}
