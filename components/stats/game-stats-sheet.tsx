'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { submitGameStats } from '@/actions/stats'
import type { StatDef } from '@/actions/stats'
import { PlayerAvatar } from '@/components/ui/player-avatar'

export interface RosterMember {
  userId: string
  name: string
  avatarUrl: string | null
}

interface Props {
  gameId: string
  leagueId: string
  homeTeam: { id: string; name: string; members: RosterMember[] }
  awayTeam: { id: string; name: string; members: RosterMember[] }
  statDefs: StatDef[]
  // userId → statKey → value (pre-populated from existing rows)
  existingStats: Record<string, Record<string, number>>
  // If set, only this teamId is shown (captain view)
  restrictToTeamId?: string
  onClose: () => void
  onSaved?: () => void
}

type StatsMap = Record<string, Record<string, number>>

function initStats(
  members: RosterMember[],
  statDefs: StatDef[],
  existing: Record<string, Record<string, number>>
): StatsMap {
  const map: StatsMap = {}
  for (const m of members) {
    map[m.userId] = {}
    for (const def of statDefs) {
      map[m.userId][def.key] = existing[m.userId]?.[def.key] ?? 0
    }
  }
  return map
}

function TeamStatsGrid({
  team,
  statDefs,
  stats,
  onChange,
}: {
  team: { id: string; name: string; members: RosterMember[] }
  statDefs: StatDef[]
  stats: StatsMap
  onChange: (userId: string, key: string, value: number) => void
}) {
  if (team.members.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No roster members.</p>
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{team.name}</h3>

      {/* Scrollable table wrapper */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-3 font-medium text-gray-500 text-xs whitespace-nowrap">Player</th>
              {statDefs.map(def => (
                <th key={def.key} className="text-center py-2 px-2 font-medium text-gray-500 text-xs whitespace-nowrap">
                  {def.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.members.map(member => (
              <tr key={member.userId} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerAvatar avatarUrl={member.avatarUrl} name={member.name} size="sm" />
                    <span className="text-xs font-medium truncate max-w-[100px]">{member.name}</span>
                  </div>
                </td>
                {statDefs.map(def => (
                  <td key={def.key} className="py-1.5 px-1.5 text-center">
                    <input
                      type="number"
                      min={0}
                      value={stats[member.userId]?.[def.key] ?? 0}
                      onChange={e => onChange(member.userId, def.key, Math.max(0, Number(e.target.value)))}
                      className="w-12 border rounded text-center text-sm py-1 font-semibold focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function GameStatsSheet({
  gameId,
  leagueId,
  homeTeam,
  awayTeam,
  statDefs,
  existingStats,
  restrictToTeamId,
  onClose,
  onSaved,
}: Props) {
  const [homeStats, setHomeStats] = useState<StatsMap>(() =>
    initStats(homeTeam.members, statDefs, existingStats)
  )
  const [awayStats, setAwayStats] = useState<StatsMap>(() =>
    initStats(awayTeam.members, statDefs, existingStats)
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const showHome = !restrictToTeamId || restrictToTeamId === homeTeam.id
  const showAway = !restrictToTeamId || restrictToTeamId === awayTeam.id

  function updateHome(userId: string, key: string, value: number) {
    setHomeStats(prev => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }))
  }
  function updateAway(userId: string, key: string, value: number) {
    setAwayStats(prev => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }))
  }

  function buildRows(statsMap: StatsMap, teamId: string) {
    return Object.entries(statsMap).flatMap(([userId, keys]) =>
      Object.entries(keys).map(([statKey, value]) => ({ userId, statKey, value }))
    ).map(r => ({ ...r }))
      .filter(() => true) // keep all (including zeros — action filters)
      .map(r => ({ userId: r.userId, statKey: r.statKey, value: r.value }))
  }

  async function handleSave() {
    setError(null)
    startSave(async () => {
      const saves: Promise<{ error: string | null }>[] = []

      if (showHome) {
        saves.push(submitGameStats({
          gameId,
          leagueId,
          teamId: homeTeam.id,
          stats: buildRows(homeStats, homeTeam.id),
        }))
      }
      if (showAway) {
        saves.push(submitGameStats({
          gameId,
          leagueId,
          teamId: awayTeam.id,
          stats: buildRows(awayStats, awayTeam.id),
        }))
      }

      const results = await Promise.all(saves)
      const err = results.find(r => r.error)?.error ?? null
      if (err) {
        setError(err)
      } else {
        onSaved?.()
        onClose()
      }
    })
  }

  const sheet = (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Enter Stats</p>
            <p className="text-sm font-semibold mt-0.5">
              {homeTeam.name} <span className="text-gray-400 font-normal">vs</span> {awayTeam.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-6">
          {statDefs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No stat categories defined for this sport.
            </p>
          ) : (
            <>
              {showHome && (
                <TeamStatsGrid
                  team={homeTeam}
                  statDefs={statDefs}
                  stats={homeStats}
                  onChange={updateHome}
                />
              )}
              {showAway && (
                <TeamStatsGrid
                  team={awayTeam}
                  statDefs={statDefs}
                  stats={awayStats}
                  onChange={updateAway}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t shrink-0 space-y-2">
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || statDefs.length === 0}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving ? 'Saving…' : 'Save Stats'}
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-semibold border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(sheet, document.body)
    : null
}
