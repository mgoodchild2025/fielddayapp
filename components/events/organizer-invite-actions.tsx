'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptOrganizerInvitation, declineOrganizerInvitation } from '@/actions/organizers'

export function OrganizerInviteActions({ token }: { token: string }) {
  const router = useRouter()
  const [declined, setDeclined] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acceptPending, startAccept] = useTransition()
  const [declinePending, startDecline] = useTransition()

  function handleAccept() {
    setError(null)
    startAccept(async () => {
      const result = await acceptOrganizerInvitation(token)
      if (result.error) {
        setError(result.error)
      } else if (result.leagueId) {
        router.push(`/admin/events/${result.leagueId}`)
      }
    })
  }

  function handleDecline() {
    if (!confirm('Decline this invitation?')) return
    setError(null)
    startDecline(async () => {
      const result = await declineOrganizerInvitation(token)
      if (result.error) setError(result.error)
      else setDeclined(true)
    })
  }

  if (declined) {
    return (
      <p className="text-center text-sm text-gray-500 mt-4">
        Invitation declined. You can close this page.
      </p>
    )
  }

  return (
    <div className="mt-6 space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={acceptPending || declinePending}
        className="w-full py-3 rounded-lg font-bold text-white text-base disabled:opacity-60 transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {acceptPending ? 'Accepting…' : 'Accept Invitation'}
      </button>
      <button
        onClick={handleDecline}
        disabled={acceptPending || declinePending}
        className="w-full py-2.5 rounded-lg font-semibold text-gray-600 text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        {declinePending ? 'Declining…' : 'Decline'}
      </button>
    </div>
  )
}
