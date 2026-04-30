'use client'

import { useState, useTransition } from 'react'
import { adminSetCaptain } from '@/actions/teams'

interface Props {
  memberId: string
  teamId: string
  leagueId: string
  playerName: string
}

export function MakeCaptainButton({ memberId, teamId, leagueId, playerName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!confirm(`Make ${playerName} the captain of this team? The current captain will be changed to player.`)) return
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
        className="text-xs text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 px-1"
      >
        {isPending ? '…' : '★'}
      </button>
      {error && <span className="text-xs text-red-500 ml-1">{error}</span>}
    </>
  )
}
