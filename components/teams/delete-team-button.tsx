'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTeam } from '@/actions/teams'

interface Props {
  teamId: string
  teamName: string
  leagueId: string
}

export function DeleteTeamButton({ teamId, teamName, leagueId }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`Delete "${teamName}"? This will remove all team members and cannot be undone.`)) return
    setLoading(true)
    const result = await deleteTeam(teamId, leagueId)
    if (result.error) {
      alert(`Error: ${result.error}`)
      setLoading(false)
    } else {
      router.refresh()
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
    >
      {loading ? 'Deleting…' : 'Delete team'}
    </button>
  )
}
