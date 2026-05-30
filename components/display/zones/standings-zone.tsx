'use client'

import { useState } from 'react'
import type { DisplayStanding, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'
import { getStandingsColumns, type PtsMethod, type VolleyballMode, type TeamStat } from '@/lib/standings'

/** Map a DisplayStanding to the shared TeamStat shape the column helpers expect. */
function toStat(s: DisplayStanding): TeamStat {
  return {
    id: s.team_id, name: s.name,
    matchesPlayed: s.played, wins: s.won, losses: s.lost, ties: s.drawn,
    pointsFor: s.gf, pointsAgainst: s.ga, setWins: s.setWins, setLosses: s.setLosses,
  }
}

// logo → color dot → nothing, with graceful error fallback
function TeamBadge({ logoUrl, color, name }: { logoUrl: string | null; color: string | null; name: string }) {
  const [imgError, setImgError] = useState(false)

  if (logoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-5 h-5 rounded-full object-cover shrink-0"
        style={{ border: '1px solid rgba(128,128,128,0.2)' }}
      />
    )
  }
  if (color) {
    return <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
  }
  return null
}

interface Props {
  standings: DisplayStanding[]
  poolStandings?: DisplayStanding[]
  config: Extract<ZoneConfig, { type: 'standings' }>
  theme: 'dark' | 'light'
  pools: { id: string; name: string }[]
  sport?: string | null
  standingsConfig?: { ptsMethod: string; volleyballMode: string }
}

export function StandingsZone({ standings, poolStandings = [], config, theme, pools, sport, standingsConfig }: Props) {
  const isDark = theme === 'dark'

  const poolName = config.pool_id
    ? pools.find((p) => p.id === config.pool_id)?.name
    : null

  // When a pool is selected, use the pool-play-only standings (already ranked
  // within each pool) so the numbers match the public Pool Play tab. Otherwise
  // use the regular-season standings.
  const ranked = config.pool_id
    ? poolStandings.filter((s) => s.pool_id === config.pool_id)
    : standings

  // Columns are sport/mode/method-aware — identical to the public standings tab.
  const ptsMethod = (standingsConfig?.ptsMethod ?? 'wins') as PtsMethod
  const volleyballMode = (standingsConfig?.volleyballMode ?? 'match_based') as VolleyballMode
  const columns = getStandingsColumns(sport, volleyballMode, ptsMethod)

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
                {columns.map((c) => (
                  <th key={c.key} className={`px-3 py-1.5 text-center ${c.emphasis ? 'font-bold' : ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const stat = toStat(s)
                return (
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
                        <TeamBadge logoUrl={s.logo_url} color={s.color} name={s.name} />
                        <span className={`font-semibold ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{s.name}</span>
                      </div>
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 text-center tabular-nums ${
                          c.emphasis
                            ? `font-bold ${isDark ? 'text-white' : 'text-gray-900'}`
                            : isDark ? 'text-zinc-400' : 'text-gray-500'
                        }`}
                      >
                        {c.value(stat, s.rank)}
                      </td>
                    ))}
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
