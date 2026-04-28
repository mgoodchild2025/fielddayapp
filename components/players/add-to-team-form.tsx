'use client'

import { useTransition, useState } from 'react'
import { addPlayerToTeam } from '@/actions/players'

interface Props {
  userId: string
  leagueId: string
  teams: { id: string; name: string }[]
}

export function AddToTeamForm({ userId, leagueId, teams }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (teams.length === 0) return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const teamId = new FormData(e.currentTarget).get('team_id') as string
    if (!teamId) return
    setError(null)
    startTransition(async () => {
      const res = await addPlayerToTeam(userId, teamId, leagueId)
      if (res.error) setError(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <select
        name="team_id"
        required
        className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
      >
        <option value="">Assign to team…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="px-2.5 py-1 rounded text-xs font-medium text-white disabled:opacity-50 shrink-0"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? '…' : 'Assign'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}
