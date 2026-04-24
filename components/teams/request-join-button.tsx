'use client'

import { useState, useTransition } from 'react'
import { requestToJoinTeam } from '@/actions/teams'

export function RequestJoinButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMessage, setShowMessage] = useState(false)
  const [message, setMessage] = useState('')

  if (done) {
    return (
      <span className="text-xs text-green-600 font-medium">Request sent ✓</span>
    )
  }

  if (showMessage) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional message to the captain…"
          rows={2}
          className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const res = await requestToJoinTeam(teamId, message || undefined)
                if (res.error) {
                  setError(res.error)
                } else {
                  setDone(true)
                }
              })
            }
            className="text-sm font-semibold text-white px-3 py-1.5 rounded disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Sending…' : 'Send Request'}
          </button>
          <button
            onClick={() => setShowMessage(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowMessage(true)}
      className="text-sm font-semibold hover:underline"
      style={{ color: 'var(--brand-primary)' }}
    >
      Request to Join →
    </button>
  )
}
