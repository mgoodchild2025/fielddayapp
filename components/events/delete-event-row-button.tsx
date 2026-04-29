'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLeague } from '@/actions/events'

interface Props {
  leagueId: string
  eventName: string
}

export function DeleteEventRowButton({ leagueId, eventName }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`Delete "${eventName}"?\n\nThis will permanently remove all teams, registrations, and games. This cannot be undone.`)) return
    setLoading(true)
    const result = await deleteLeague(leagueId)
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
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 ml-3"
    >
      {loading ? '…' : 'Delete'}
    </button>
  )
}
