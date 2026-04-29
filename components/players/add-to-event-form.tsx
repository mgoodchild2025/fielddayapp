'use client'

import { useTransition, useState } from 'react'
import { addPlayerToLeague } from '@/actions/players'

interface Props {
  userId: string
  leagues: { id: string; name: string; status: string }[]
}

export function AddToEventForm({ userId, leagues }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const leagueId = new FormData(e.currentTarget).get('league_id') as string
    if (!leagueId) return
    setError(null)
    startTransition(async () => {
      const res = await addPlayerToLeague(userId, leagueId)
      if (res.error) setError(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-3 border-t">
      <select
        name="league_id"
        required
        className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
      >
        <option value="">Add to league…</option>
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50 shrink-0"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? '…' : 'Add'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </form>
  )
}
