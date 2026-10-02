'use client'

import { useState, useTransition } from 'react'
import { upsertRsvp } from '@/actions/rsvp'
import { toast } from 'sonner'
import { RsvpChoice } from '@/components/schedule/rsvp-choice'

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
    const prev = status
    setStatus(next)  // optimistic
    startTransition(async () => {
      const result = await upsertRsvp(gameId, teamId, next)
      if (result.error) {
        setStatus(prev)  // revert on failure
        toast.error("Couldn't save your RSVP. Check your connection and try again.", { id: 'rsvp-error' })
      }
    })
  }

  return (
    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
      <span className="text-xs font-medium text-gray-500 mr-0.5">Going?</span>
      <RsvpChoice value={status} onChange={tap} disabled={isPending} />
    </div>
  )
}
