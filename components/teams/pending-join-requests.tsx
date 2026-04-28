'use client'

import { useState, useTransition } from 'react'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/teams'

interface JoinRequest {
  id: string
  playerName: string
  playerEmail: string
  message: string | null
  createdAt: string
}

interface Props {
  teamId: string
  initialRequests: JoinRequest[]
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PendingJoinRequests({ teamId, initialRequests }: Props) {
  const [requests, setRequests] = useState(initialRequests)
  const [pending, startTransition] = useTransition()

  if (requests.length === 0) return null

  function handleApprove(requestId: string) {
    setRequests((prev) => prev.filter((r) => r.id !== requestId))
    startTransition(async () => {
      const result = await approveJoinRequest(requestId)
      if (result.error) setRequests(initialRequests) // revert on failure
    })
  }

  function handleReject(requestId: string) {
    if (!confirm('Decline this join request?')) return
    setRequests((prev) => prev.filter((r) => r.id !== requestId))
    startTransition(async () => {
      const result = await rejectJoinRequest(requestId)
      if (result.error) setRequests(initialRequests)
    })
  }

  return (
    <div className="mt-6 bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <h2 className="font-semibold">Join Requests</h2>
        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {requests.length}
        </span>
      </div>
      <ul className="divide-y">
        {requests.map((req) => (
          <li key={req.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{req.playerName || req.playerEmail}</p>
                <p className="text-xs text-gray-400 truncate">{req.playerEmail}</p>
                {req.message && (
                  <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">{relativeTime(req.createdAt)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleApprove(req.id)}
                  disabled={pending}
                  className="text-xs font-semibold text-white px-3 py-1.5 rounded disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  disabled={pending}
                  className="text-xs font-semibold text-gray-500 px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
