'use client'

import { useTransition } from 'react'
import { joinSession, leaveSession } from '@/actions/sessions'
import { useRouter } from 'next/navigation'

interface Props {
  sessionId: string
  leagueId: string
  isJoined: boolean
  isFull: boolean
  isCancelled: boolean
  isLoggedIn: boolean
}

export function SessionJoinButton({ sessionId, leagueId, isJoined, isFull, isCancelled, isLoggedIn }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (isCancelled) return null

  if (!isLoggedIn) {
    return (
      <a
        href="/login"
        className="px-4 py-1.5 rounded-md text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        Log in to join
      </a>
    )
  }

  if (isJoined) {
    return (
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await leaveSession(sessionId, leagueId)
            router.refresh()
          })
        }
        className="px-4 py-1.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
      >
        {isPending ? 'Leaving…' : 'Leave'}
      </button>
    )
  }

  if (isFull) {
    return (
      <span className="px-3 py-1.5 rounded-md text-sm font-medium text-red-600 bg-red-50 border border-red-200">
        Full
      </span>
    )
  }

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await joinSession(sessionId, leagueId)
          router.refresh()
        })
      }
      className="px-4 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-40"
      style={{ backgroundColor: 'var(--brand-primary)' }}
    >
      {isPending ? 'Joining…' : 'Join'}
    </button>
  )
}
