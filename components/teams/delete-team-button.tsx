'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTeam } from '@/actions/teams'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

interface Props {
  teamId: string
  teamName: string
  leagueId: string
}

export function DeleteTeamButton({ teamId, teamName, leagueId }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!(await confirmAction({ title: `Delete "${teamName}"?`, message: "All team members are removed. This can't be undone.", confirmLabel: "Delete team", destructive: true }))) return
    setLoading(true)
    const result = await deleteTeam(teamId, leagueId)
    if (result.error) {
      toast.error(result.error)
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
