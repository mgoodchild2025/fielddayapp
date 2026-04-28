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

  function handle() {
    if (!confirm(`Remove ${playerName} from the league?\n\nThis will delete their registration.`)) return
    startTransition(async () => {
      await removeRegistration(registrationId, leagueId)
      setDone(true)
    })
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
    >
      {pending ? '…' : 'Remove'}
    </button>
  )
}
