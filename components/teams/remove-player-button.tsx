'use client'

import { useState } from 'react'
import { removeTeamMember } from '@/actions/teams'
import { confirmAction } from '@/components/ui/confirm-dialog'

interface Props {
  memberId: string
  leagueId: string
  playerName: string
}

export function RemovePlayerButton({ memberId, leagueId, playerName }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleRemove() {
    if (!(await confirmAction({ title: `Remove ${playerName} from this team?`, confirmLabel: "Remove", destructive: true }))) return
    setLoading(true)
    await removeTeamMember(memberId, leagueId)
    // revalidatePath in the action will refresh the page data
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      title={`Remove ${playerName}`}
      aria-label={`Remove ${playerName}`}
      className="press inline-flex items-center justify-center min-h-10 min-w-10 -my-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 leading-none"
    >
      {loading ? '…' : '×'}
    </button>
  )
}
