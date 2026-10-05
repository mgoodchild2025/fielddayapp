'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { declineOrganizerInvitation } from '@/actions/organizers'

/**
 * The email's "Decline" link lands here and asks first. It used to decline as
 * soon as the page was OPENED — and email security scanners (Outlook Safe
 * Links and friends) open every link in a message automatically, so an
 * invitation could be declined before the person ever saw it.
 */
export function DeclineOrganizerInvite({ token, leagueName }: { token: string; leagueName: string }) {
  const [state, setState] = useState<'ask' | 'done'>('ask')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (state === 'done') {
    return (
      <div className="text-center" role="status">
        <p className="text-2xl font-bold mb-2">Invitation declined</p>
        <p className="text-gray-600 text-sm">You won&apos;t be added as a co-organizer of {leagueName}.</p>
        <Link href="/" className="press mt-6 inline-flex items-center min-h-10 text-sm font-semibold text-brand-ink">Go to the home page →</Link>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <p className="text-xl font-bold">Decline this invitation?</p>
      <p className="text-gray-600 text-sm">You&apos;re declining the invitation to co-organize <strong>{leagueName}</strong>.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null)
          const res = await declineOrganizerInvitation(token)
          if (res?.error) setError(res.error)
          else setState('done')
        })}
        className="press w-full min-h-11 rounded-lg font-semibold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
      >
        {pending ? 'Declining…' : 'Yes, decline'}
      </button>
      <Link href={`/organizer-invite/${token}`} className="press inline-flex items-center justify-center w-full min-h-11 rounded-lg font-semibold border text-gray-700 hover:bg-gray-50">
        No — show me the invitation
      </Link>
    </div>
  )
}
