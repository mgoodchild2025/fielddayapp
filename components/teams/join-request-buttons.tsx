'use client'

import { useTransition } from 'react'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/teams'

export function JoinRequestButtons({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <span className="flex items-center gap-2">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await approveJoinRequest(requestId) })}
        className="text-xs font-semibold text-white px-2 py-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        Approve
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rejectJoinRequest(requestId) })}
        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        Reject
      </button>
    </span>
  )
}
