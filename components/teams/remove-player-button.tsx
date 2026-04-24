'use client'

import { useState } from 'react'
import { removeTeamMember } from '@/actions/teams'

interface Props {
  memberId: string
  leagueId: string
  playerName: string
}

export function RemovePlayerButton({ memberId, leagueId, playerName }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleRemove() {
    if (!confirm(`Remove ${playerName} from this team?`)) return
    setLoading(true)
    await removeTeamMember(memberId, leagueId)
    // revalidatePath in the action will refresh the page data
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      title={`Remove ${playerName}`}
      className="ml-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 transition-colors leading-none"
    >
      {loading ? '…' : '×'}
    </button>
  )
}
