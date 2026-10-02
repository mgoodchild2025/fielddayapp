'use client'

import { useState, useTransition } from 'react'
import { removeRegistration } from '@/actions/registrations'
import { confirmAction } from '@/components/ui/confirm-dialog'

interface Props {
  registrationId: string
  leagueId: string
  playerName: string
}

export function RemoveRegistrationButton({ registrationId, leagueId, playerName }: Props) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) return null

  async function handle() {
    if (!(await confirmAction({ title: `Remove ${playerName} from the league?`, message: "Their registration is deleted.", confirmLabel: "Remove", destructive: true }))) return
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
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handle}
        disabled={pending}
        className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
      >
        {pending ? '…' : 'Remove'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
