'use client'

import { useState } from 'react'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { StatDef } from '@/actions/stats'

export interface LeaderboardPlayer {
  userId: string
  name: string
  avatarUrl: string | null
  teamName: string
  totals: Record<string, number>
}

interface Props {
  statDefs: StatDef[]
  players: LeaderboardPlayer[]
}

export function StatsLeaderboard({ statDefs, players }: Props) {
  const [activeStat, setActiveStat] = useState<string>(statDefs[0]?.key ?? '')

  if (statDefs.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-12">
        No stats recorded yet.
      </p>
    )
  }

  const activeDef = statDefs.find(d => d.key === activeStat) ?? statDefs[0]

  // Sort players by active stat descending, then name
  const sorted = [...players]
    .filter(p => (p.totals[activeStat] ?? 0) > 0)
    .sort((a, b) => (b.totals[activeStat] ?? 0) - (a.totals[activeStat] ?? 0) || a.name.localeCompare(b.name))

  return (
    <div className="space-y-4">

      {/* Stat category pills — horizontally scrollable on mobile */}
      <div className="relative -mx-4 sm:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {statDefs.map(def => {
            const active = def.key === activeStat
            return (
              <button
                key={def.key}
                onClick={() => setActiveStat(def.key)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
              >
                {def.label}
              </button>
            )
          })}
        </div>
        {/* Right-edge fade hint on mobile */}
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 sm:hidden"
          style={{ background: 'linear-gradient(to left, var(--brand-bg, #f8f8f8), transparent)' }}
        />
      </div>

      {/* Leaderboard list */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border py-12 text-center">
          <p className="text-gray-400 text-sm">No {activeDef.label.toLowerCase()} recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          {sorted.map((player, i) => {
            const value = player.totals[activeStat] ?? 0
            const isFirst = i === 0
            return (
              <div
                key={player.userId}
                className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 ${
                  isFirst ? 'bg-amber-50' : ''
                }`}
              >
                {/* Rank */}
                <span
                  className={`w-6 text-center text-sm font-bold shrink-0 ${
                    i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'
                  }`}
                >
                  {i + 1}
                </span>

                {/* Avatar */}
                <PlayerAvatar avatarUrl={player.avatarUrl} name={player.name} size="sm" />

                {/* Name + team */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{player.name}</p>
                  <p className="text-xs text-gray-400 truncate">{player.teamName}</p>
                </div>

                {/* Stat value */}
                <span
                  className="text-lg font-bold shrink-0"
                  style={{ color: isFirst ? 'var(--brand-primary)' : undefined }}
                >
                  {Number.isInteger(value) ? value : value.toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
