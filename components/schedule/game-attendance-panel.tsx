'use client'

import { useState, useTransition } from 'react'
import { getGameAttendanceDetails } from '@/actions/rsvp'
import { InviteSubButton } from '@/components/schedule/invite-sub-button'
import type { AttendancePlayer } from '@/actions/rsvp'
import type { GameSub } from '@/actions/game-subs'
import { Collapse } from '@/components/ui/collapse'

interface Props {
  gameId: string
  /** The captain's team ID — used to fetch the roster */
  teamId: string
  initialCounts: { in: number; out: number; total: number }
  /** When true, shows the "Invite Sub" button and sub list */
  isCaptain?: boolean
  /** Pre-fetched game subs for this team (only passed for captains) */
  gameSubs?: GameSub[]
}

export function GameAttendancePanel({ gameId, teamId, initialCounts, isCaptain, gameSubs }: Props) {
  const [open, setOpen] = useState(false)
  const [players, setPlayers] = useState<AttendancePlayer[] | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const noResponse = Math.max(0, initialCounts.total - initialCounts.in - initialCounts.out)

  function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    // Only fetch once
    if (!players && !isPending) {
      startTransition(async () => {
        const result = await getGameAttendanceDetails(gameId, teamId)
        if (result.error) setFetchError(result.error)
        else setPlayers(result.players)
      })
    }
  }

  return (
    // basis-full: it sits in the RSVP row (flex-wrap) — as a flex item it
    // squeezed into a narrow column beside the RSVP buttons and pushed them
    // around when opened. Its own full-width line instead.
    <div className="basis-full w-full mt-2.5 pt-2.5 border-t border-gray-100">
      {/* Badge button — toggles the panel */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        // A real button: it was a 10px, ~18px-tall pill — the captain's main
        // "who's coming?" control on a phone.
        className="press inline-flex items-center gap-2 min-h-10 px-3 rounded-full text-sm font-semibold bg-green-50 border border-green-200 text-green-800 hover:bg-green-100 select-none"
      >
        <span>{initialCounts.in}/{initialCounts.total} in</span>
        {initialCounts.out > 0 && (
          <span className="text-red-600">· {initialCounts.out} out</span>
        )}
        {noResponse > 0 && (
          <span className="text-gray-600">· {noResponse} no reply</span>
        )}
        <svg aria-hidden="true" className="w-4 h-4 text-gray-500 transition-transform duration-150" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded roster panel */}
      <Collapse open={open} className="mt-2 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
          {isPending ? (
            <p className="px-3 py-3 text-xs text-gray-500">Loading…</p>
          ) : fetchError ? (
            <p className="px-3 py-3 text-xs text-red-600">{fetchError}</p>
          ) : players ? (
            <>
              {/* Summary line */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-3 text-xs font-medium">
                <span className="text-green-700">{initialCounts.in} going</span>
                {initialCounts.out > 0 && <span className="text-red-600">{initialCounts.out} out</span>}
                {noResponse > 0 && <span className="text-gray-600">{noResponse} no response</span>}
              </div>
              {/* Player list */}
              <ul>
                {players.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    {/* Status icon */}
                    <span
                      className={`shrink-0 text-sm font-bold w-4 text-center ${
                        p.rsvp === 'in'
                          ? 'text-green-600'
                          : p.rsvp === 'out'
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {p.rsvp === 'in' ? '✓' : p.rsvp === 'out' ? '✗' : '?'}
                    </span>
                    {/* Name */}
                    <span
                      className={`text-sm flex-1 truncate ${
                        p.rsvp === null ? 'text-gray-500' : 'text-gray-800'
                      }`}
                    >
                      {p.name}
                    </span>
                    {/* Captain marker */}
                    {p.role === 'captain' && (
                      <span className="shrink-0 text-[9px] font-semibold text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                        C
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* Invite Sub section — captains only */}
              {isCaptain && (
                <div className="px-3 pb-3">
                  <InviteSubButton
                    gameId={gameId}
                    teamId={teamId}
                    initialSubs={gameSubs ?? []}
                  />
                </div>
              )}
            </>
          ) : null}
      </Collapse>
    </div>
  )
}
