'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { joinTeamByCode } from '@/actions/teams'

interface Props {
  teamCode: string
  teamId: string
  teamName: string
  leagueSlug: string
}

export function JoinTeamByCodeClient({ teamCode, teamId, teamName, leagueSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleJoin() {
    setError(null)
    startTransition(async () => {
      const result = await joinTeamByCode(teamCode)
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/teams/${teamId}`)
      }
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleJoin}
        disabled={pending}
        className="w-full py-3 rounded-lg font-bold text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {pending ? 'Joining…' : `Join ${teamName}`}
      </button>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      )}
    </div>
  )
}
