'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLeague } from '@/actions/events'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

interface Props {
  leagueId: string
  eventName: string
}

export function DeleteEventRowButton({ leagueId, eventName }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!(await confirmAction({ title: `Delete "${eventName}"?`, message: "All its teams, registrations and games are permanently removed. This can't be undone.", confirmLabel: "Delete event", destructive: true }))) return
    setLoading(true)
    const result = await deleteLeague(leagueId)
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
      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50 ml-3"
    >
      {loading ? '…' : 'Delete'}
    </button>
  )
}
