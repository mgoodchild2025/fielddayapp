'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreLeague, purgeLeague } from '@/actions/events'

export function TrashRowActions({ leagueId, name }: { leagueId: string; name: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function restore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreLeague(leagueId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function purge() {
    setError(null)
    startTransition(async () => {
      const res = await purgeLeague(leagueId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={restore}
          disabled={isPending}
          className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Restore
        </button>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="text-sm font-medium px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete permanently
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={purge}
              disabled={isPending}
              className="text-sm font-semibold px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : `Permanently delete ${name}?`}
            </button>
            <button onClick={() => setConfirming(false)} className="text-sm text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
