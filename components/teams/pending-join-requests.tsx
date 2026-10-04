'use client'

import { useState, useTransition } from 'react'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/teams'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
  const router = useRouter()

  if (requests.length === 0) return null

  // Revert only THIS row on failure (resetting to initialRequests brought back
  // requests already approved), say why, and refresh on success so the new
  // player shows on the roster. try/catch: a thrown network error inside a
  // transition replaced the page with the error screen.
  function settle(req: JoinRequest | undefined, index: number, err: string | null, verb: string) {
    if (err) {
      if (req) setRequests((prev) => (prev.some((r) => r.id === req.id) ? prev : [...prev.slice(0, index), req, ...prev.slice(index)]))
      toast.error(err === 'network' ? `Couldn't ${verb} — check your connection and try again.` : err)
    } else {
      router.refresh()
    }
  }

  function handleApprove(requestId: string) {
    const index = requests.findIndex((r) => r.id === requestId)
    const req = requests[index]
    setRequests((prev) => prev.filter((r) => r.id !== requestId))
    startTransition(async () => {
      let err: string | null = null
      try { err = (await approveJoinRequest(requestId)).error ?? null } catch { err = 'network' }
      settle(req, index, err, 'approve')
      if (!err && req) toast.success(`${req.playerName || req.playerEmail} added to the team`)
    })
  }

  async function handleReject(requestId: string) {
    if (!(await confirmAction({ title: "Decline this join request?", confirmLabel: "Decline", destructive: true }))) return
    const index = requests.findIndex((r) => r.id === requestId)
    const req = requests[index]
    setRequests((prev) => prev.filter((r) => r.id !== requestId))
    startTransition(async () => {
      let err: string | null = null
      try { err = (await rejectJoinRequest(requestId)).error ?? null } catch { err = 'network' }
      settle(req, index, err, 'decline')
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{req.playerName || req.playerEmail}</p>
                <p className="text-xs text-gray-500 truncate">{req.playerEmail}</p>
                {req.message && (
                  <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{relativeTime(req.createdAt)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleApprove(req.id)}
                  disabled={pending}
                  className="press min-h-10 px-4 rounded-lg text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  disabled={pending}
                  className="press min-h-10 px-4 rounded-lg border text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
