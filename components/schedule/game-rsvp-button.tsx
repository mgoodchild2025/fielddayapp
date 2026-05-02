'use client'

import { useState, useTransition } from 'react'
import { upsertRsvp } from '@/actions/rsvp'

interface Props {
  gameId: string
  /** The team this player belongs to for this game */
  teamId: string
  initialStatus: 'in' | 'out' | null
}

export function GameRsvpButton({ gameId, teamId, initialStatus }: Props) {
  const [status, setStatus] = useState<'in' | 'out' | null>(initialStatus)
  const [isPending, startTransition] = useTransition()

  function tap(next: 'in' | 'out') {
    if (status === next) return  // already set — no-op
    const prev = status
    setStatus(next)  // optimistic
    startTransition(async () => {
      const result = await upsertRsvp(gameId, teamId, next)
      if (result.error) {
        setStatus(prev)  // revert on failure
      }
    })
  }

  return (
    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mr-0.5">Going?</span>
      <button
        type="button"
        onClick={() => tap('in')}
        disabled={isPending}
        aria-pressed={status === 'in'}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all select-none ${
          status === 'in'
            ? 'bg-green-500 text-white border-green-500 shadow-sm'
            : 'bg-white border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600'
        } disabled:opacity-60`}
      >
        <span className="text-[10px]">✓</span> In
      </button>
      <button
        type="button"
        onClick={() => tap('out')}
        disabled={isPending}
        aria-pressed={status === 'out'}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all select-none ${
          status === 'out'
            ? 'bg-red-500 text-white border-red-500 shadow-sm'
            : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'
        } disabled:opacity-60`}
      >
        <span className="text-[10px]">✗</span> Out
      </button>
    </div>
  )
}
