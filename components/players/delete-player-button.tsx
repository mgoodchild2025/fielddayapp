'use client'

import { useState, useTransition } from 'react'
import { removePlayerFromOrg } from '@/actions/players'

export function DeletePlayerButton({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Remove {name}?</span>
        <button
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const res = await removePlayerFromOrg(userId)
              if (res.error) { setError(res.error); setConfirming(false) }
            })
          }}
          disabled={isPending}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          {isPending ? 'Removing…' : 'Yes, remove'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs font-medium text-red-500 hover:underline ml-3"
    >
      Remove
    </button>
  )
}
