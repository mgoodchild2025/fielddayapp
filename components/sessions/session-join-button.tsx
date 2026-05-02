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
  /** False when the event requires waiver/payment and the player hasn't registered yet */
  isRegistered?: boolean
  /** URL to send the player through to complete registration (waiver + payment) */
  registerUrl?: string
}

export function SessionJoinButton({
  sessionId,
  leagueId,
  isJoined,
  isFull,
  isCancelled,
  isLoggedIn,
  isRegistered = true,
  registerUrl,
}: Props) {
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

  // Player needs to complete registration (waiver + payment) before joining sessions
  if (!isRegistered && registerUrl) {
    return (
      <a
        href={registerUrl}
        className="px-4 py-1.5 rounded-md text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        Register to join →
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
