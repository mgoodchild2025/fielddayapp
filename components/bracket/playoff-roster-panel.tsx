'use client'

import { useMemo } from 'react'
import { ArrowUp, ArrowDown, RotateCcw, UserMinus, UserPlus } from 'lucide-react'
import { applyRoster, moveInField, rosterIsActive, type PlayoffRoster } from '@/lib/playoff-roster'
import type { TeamStanding } from '@/lib/bracket'

interface Props {
  /** Every team, in standings order. */
  teams: TeamStanding[]
  roster: PlayoffRoster
  onChange: (roster: PlayoffRoster) => void
  /** Highest seed any tier expects — used to warn when the field is too small. */
  seedsNeeded: number
  disabled?: boolean
}

function record(t: TeamStanding): string {
  return t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`
}

/**
 * Playoff roster (Phase A) — who is in the field and in what order.
 *
 * Sitting a team out collapses it off the field and shifts everyone below up;
 * the arrows build a hand-picked order. Both are saved with the config, so the
 * field survives reload, re-seed and regeneration.
 */
export function PlayoffRosterPanel({ teams, roster, onChange, seedsNeeded, disabled }: Props) {
  // Full order INCLUDING teams sitting out — a team brought back returns to
  // its place instead of dropping to the bottom.
  const fullOrder = useMemo(
    () => applyRoster(teams, { customOrder: roster.customOrder, excluded: [] }).map((t) => t.teamId),
    [teams, roster.customOrder]
  )
  const field = useMemo(() => applyRoster(teams, roster), [teams, roster])
  const sittingOut = useMemo(
    () => teams.filter((t) => roster.excluded.includes(t.teamId)),
    [teams, roster.excluded]
  )

  const isCustom = (roster.customOrder?.length ?? 0) > 0
  const shortBy = seedsNeeded - field.length

  function move(teamId: string, delta: number) {
    onChange({
      ...roster,
      customOrder: moveInField(fullOrder, field.map((t) => t.teamId), teamId, delta),
    })
  }

  function sitOut(teamId: string) {
    onChange({
      // Pin the current order so the seeds below don't also reshuffle
      customOrder: roster.customOrder ?? fullOrder,
      excluded: [...roster.excluded, teamId],
    })
  }

  function bringBack(teamId: string) {
    onChange({ ...roster, excluded: roster.excluded.filter((id) => id !== teamId) })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Playoff Roster</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {field.length} team{field.length !== 1 ? 's' : ''} in the field
            {' · '}
            {isCustom ? 'custom order' : 'standings order'}
            {sittingOut.length > 0 && ` · ${sittingOut.length} sitting out`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ customOrder: null, excluded: [] })}
          disabled={disabled || !rosterIsActive(roster)}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 disabled:hover:text-gray-500"
          title="Put every team back in, in standings order"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to standings
        </button>
      </div>

      {shortBy > 0 && (
        <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
          Your tiers expect {seedsNeeded} seeds but only {field.length} team{field.length !== 1 ? 's are' : ' is'} in
          the field — the last {shortBy} slot{shortBy !== 1 ? 's' : ''} will be left empty. Shrink the tier ranges or
          bring a team back.
        </p>
      )}

      <ul className="divide-y">
        {field.map((t, i) => {
          const seed = i + 1
          return (
            <li key={t.teamId} className="px-4 py-2 flex items-center gap-3">
              <span className={`text-xs font-mono w-6 shrink-0 ${seed > seedsNeeded ? 'text-gray-300' : 'text-gray-400'}`}>
                {seed}
              </span>
              <span className={`text-sm flex-1 truncate ${seed > seedsNeeded ? 'text-gray-400' : 'text-gray-800'}`}>
                {t.teamName}
                {seed > seedsNeeded && <span className="text-xs text-gray-300 ml-2">(outside the bracket)</span>}
              </span>
              <span className="text-xs text-gray-400 tabular-nums">{record(t)}</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(t.teamId, -1)}
                  disabled={disabled || i === 0}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Move up"
                  aria-label={`Move ${t.teamName} up`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(t.teamId, 1)}
                  disabled={disabled || i === field.length - 1}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Move down"
                  aria-label={`Move ${t.teamName} down`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => sitOut(t.teamId)}
                  disabled={disabled}
                  className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                  title="Sit this team out — everyone below shifts up"
                  aria-label={`Sit ${t.teamName} out`}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          )
        })}
        {field.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-gray-400">Every team is sitting out.</li>
        )}
      </ul>

      {sittingOut.length > 0 && (
        <div className="border-t bg-gray-50">
          <p className="px-4 pt-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sitting out</p>
          <ul className="divide-y divide-gray-100">
            {sittingOut.map((t) => (
              <li key={t.teamId} className="px-4 py-2 flex items-center gap-3">
                <span className="text-sm text-gray-400 line-through flex-1 truncate">{t.teamName}</span>
                <span className="text-xs text-gray-300 tabular-nums">{record(t)}</span>
                <button
                  type="button"
                  onClick={() => bringBack(t.teamId)}
                  disabled={disabled}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
