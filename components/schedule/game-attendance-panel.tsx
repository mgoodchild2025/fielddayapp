'use client'

import { useState, useTransition } from 'react'
import { getGameAttendanceDetails } from '@/actions/rsvp'
import type { AttendancePlayer } from '@/actions/rsvp'

interface Props {
  gameId: string
  /** The captain's team ID — used to fetch the roster */
  teamId: string
  initialCounts: { in: number; out: number; total: number }
}

export function GameAttendancePanel({ gameId, teamId, initialCounts }: Props) {
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
    <div className="mt-2.5 pt-2.5 border-t border-gray-100">
      {/* Badge button — toggles the panel */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 border border-green-100 text-green-700 hover:bg-green-100 active:bg-green-200 transition-colors select-none"
      >
        <span>{initialCounts.in}/{initialCounts.total} ✓</span>
        {initialCounts.out > 0 && (
          <span className="text-red-500">{initialCounts.out} ✗</span>
        )}
        {noResponse > 0 && (
          <span className="text-gray-400">{noResponse} ?</span>
        )}
        <span
          className="text-[8px] text-gray-400 transition-transform duration-150 inline-block"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {/* Expanded roster panel */}
      {open && (
        <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
          {isPending ? (
            <p className="px-3 py-3 text-xs text-gray-400">Loading…</p>
          ) : fetchError ? (
            <p className="px-3 py-3 text-xs text-red-500">{fetchError}</p>
          ) : players ? (
            <>
              {/* Summary line */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-3 text-[10px] font-medium">
                <span className="text-green-600">{initialCounts.in} going</span>
                {initialCounts.out > 0 && <span className="text-red-400">{initialCounts.out} out</span>}
                {noResponse > 0 && <span className="text-gray-400">{noResponse} no response</span>}
              </div>
              {/* Player list */}
              <ul>
                {players.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center gap-2.5 px-3 py-1.5 border-b border-gray-50 last:border-0"
                  >
                    {/* Status icon */}
                    <span
                      className={`shrink-0 text-[11px] font-bold w-3.5 text-center ${
                        p.rsvp === 'in'
                          ? 'text-green-500'
                          : p.rsvp === 'out'
                          ? 'text-red-400'
                          : 'text-gray-300'
                      }`}
                    >
                      {p.rsvp === 'in' ? '✓' : p.rsvp === 'out' ? '✗' : '?'}
                    </span>
                    {/* Name */}
                    <span
                      className={`text-xs flex-1 truncate ${
                        p.rsvp === null ? 'text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {p.name}
                    </span>
                    {/* Captain marker */}
                    {p.role === 'captain' && (
                      <span className="shrink-0 text-[9px] font-semibold text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                        C
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
