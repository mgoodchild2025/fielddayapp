'use client'

import { useState, useTransition } from 'react'
import { adminSetCaptain } from '@/actions/teams'
import { confirmAction } from '@/components/ui/confirm-dialog'

interface Props {
  memberId: string
  teamId: string
  leagueId: string
  playerName: string
}

export function MakeCaptainButton({ memberId, teamId, leagueId, playerName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (!(await confirmAction({ title: `Make ${playerName} the captain?`, message: "The current captain becomes a player.", confirmLabel: "Make captain" }))) return
    setError(null)
    startTransition(async () => {
      const result = await adminSetCaptain(memberId, teamId, leagueId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        title="Make captain"
        className="text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 px-1"
      >
        {isPending ? '…' : '★'}
      </button>
      {error && <span className="text-xs text-red-500 ml-1">{error}</span>}
    </>
  )
}
