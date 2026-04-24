'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLeague } from '@/actions/leagues'

interface Props {
  leagueId: string
  leagueName: string
}

export function DeleteLeagueButton({ leagueId, leagueName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteLeague(leagueId)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      setConfirming(false)
    } else {
      router.push('/admin/leagues')
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full py-2 rounded-md text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
      >
        Delete League
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-red-600 font-medium">
        This will permanently delete &ldquo;{leagueName}&rdquo; including all teams, members, registrations, and games. This cannot be undone.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="flex-1 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="flex-1 py-2 rounded-md text-sm font-semibold border hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
