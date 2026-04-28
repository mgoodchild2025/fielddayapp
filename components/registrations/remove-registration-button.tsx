'use client'

import { useState, useTransition } from 'react'
import { removeRegistration } from '@/actions/registrations'

interface Props {
  registrationId: string
  leagueId: string
  playerName: string
}

export function RemoveRegistrationButton({ registrationId, leagueId, playerName }: Props) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  if (done) return null

  const [error, setError] = useState<string | null>(null)

  function handle() {
    if (!confirm(`Remove ${playerName} from the league?\n\nThis will delete their registration.`)) return
    setError(null)
    startTransition(async () => {
      const result = await removeRegistration(registrationId, leagueId)
      if (result.error) {
        setError(result.error)
      } else {
        setDone(true)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handle}
        disabled={pending}
        className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
      >
        {pending ? '…' : 'Remove'}
      </button>
      {error && <span className="text-xs text-red-600" title={error}>!</span>}
    </span>
  )
}
