'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { BioNameButton } from '@/components/bios/bio-name-button'
import type { BioCardData } from '@/components/bios/player-bio-card'
import type { StatDef } from '@/actions/stats'

export interface LeaderboardPlayer {
  userId: string
  name: string
  avatarUrl: string | null
  teamName: string
  totals: Record<string, number>
  /** When present the name opens this player's card (career lazy-loads on tap). */
  bio?: BioCardData
}

interface Props {
  statDefs: StatDef[]
  players: LeaderboardPlayer[]
  /**
   * Team stats page: list the WHOLE roster, dashes where nothing was recorded,
   * uncredited players last. The event-wide leaderboard leaves this off — there
   * it is a ranking, and every uncredited player in the league would bury it.
   */
  includeUncredited?: boolean
  /** Link to the team's card binder, shown above the list. */
  binderHref?: string
}

export function StatsLeaderboard({ statDefs, players, includeUncredited = false, binderHref }: Props) {
  const [activeStat, setActiveStat] = useState<string>(statDefs[0]?.key ?? '')

  // A roster is still worth showing for a sport that tracks no stats at all.
  if (statDefs.length === 0 && !includeUncredited) {
    return (
      <p className="text-center text-gray-400 text-sm py-12">
        No stats recorded yet.
      </p>
    )
  }

  const activeDef = statDefs.find(d => d.key === activeStat) ?? statDefs[0]
  const hasStats = statDefs.length > 0

  // Ranked first (descending, then name); everyone else alphabetically after.
  const credited = hasStats
    ? [...players]
        .filter(p => (p.totals[activeStat] ?? 0) > 0)
        .sort((a, b) => (b.totals[activeStat] ?? 0) - (a.totals[activeStat] ?? 0) || a.name.localeCompare(b.name))
    : []
  const uncredited = includeUncredited
    ? [...players]
        .filter(p => !hasStats || !((p.totals[activeStat] ?? 0) > 0))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []
  const sorted = [...credited, ...uncredited]

  return (
    <div className="space-y-4">

      {binderHref && (
        <div className="flex justify-end -mb-1">
          <Link href={binderHref} className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand-primary)' }}>
            🃏 Card Binder →
          </Link>
        </div>
      )}

      {/* Stat category pills — horizontally scrollable on mobile */}
      {hasStats && (
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
      )}

      {/* Leaderboard list */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border py-12 text-center">
          <p className="text-gray-400 text-sm">
            {hasStats ? `No ${activeDef.label.toLowerCase()} recorded yet.` : 'No players on the roster yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          {sorted.map((player, i) => {
            const value = player.totals[activeStat] ?? 0
            const ranked = hasStats && value > 0
            const isFirst = ranked && i === 0
            return (
              <div
                key={player.userId}
                className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 ${
                  isFirst ? 'bg-amber-50' : ''
                }`}
              >
                {/* Rank — only meaningful for a player with a recorded value */}
                <span
                  className={`w-6 text-center text-sm font-bold shrink-0 ${
                    !ranked ? 'text-gray-200' : i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'
                  }`}
                >
                  {ranked ? i + 1 : '·'}
                </span>

                {/* Avatar */}
                <PlayerAvatar avatarUrl={player.avatarUrl} name={player.name} size="sm" />

                {/* Name + team — tapping the name opens the player's card */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {player.bio
                      ? <BioNameButton bio={player.bio} userId={player.userId}>{player.name}</BioNameButton>
                      : player.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{player.teamName}</p>
                </div>

                {/* Stat value — a dash reads as "nothing recorded", not zero */}
                {hasStats && (
                  <span
                    className={`text-lg font-bold shrink-0 ${ranked ? '' : 'text-gray-300'}`}
                    style={{ color: isFirst ? 'var(--brand-primary)' : undefined }}
                  >
                    {ranked ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Column definitions legend */}
      {hasStats && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1">
        {statDefs.map(def => (
          <span key={def.key} className="text-xs text-gray-400">
            <span className="font-semibold text-gray-500">{def.label}</span>
            {' '}({def.key})
          </span>
        ))}
      </div>
      )}
    </div>
  )
}
