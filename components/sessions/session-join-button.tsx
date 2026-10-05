'use client'

import { useState, useTransition } from 'react'
import { joinSession, leaveSession } from '@/actions/sessions'
import { usePathname, useRouter } from 'next/navigation'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { safeAction } from '@/lib/action-errors'

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
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  if (isCancelled) return null

  if (!isLoggedIn) {
    // The register link offers sign-in OR continue-as-guest and keeps the
    // session; a bare /login lost the event entirely.
    return (
      <a
        href={registerUrl ?? `/login?redirect=${encodeURIComponent(pathname)}`}
        className="press inline-flex items-center min-h-10 px-4 rounded-md text-sm font-semibold bg-brand-primary text-on-brand"
      >
        Join →
      </a>
    )
  }

  // Player needs to complete registration (waiver + payment) before joining sessions
  if (!isRegistered && registerUrl) {
    return (
      <a
        href={registerUrl}
        className="press inline-flex items-center min-h-10 px-4 rounded-md text-sm font-semibold bg-brand-primary text-on-brand"
      >
        Register to join →
      </a>
    )
  }

  if (isJoined) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          disabled={isPending}
          onClick={async () => {
            setError(null)
            // "Leave" sits exactly where "Join" was: a stray tap gave up the
            // spot (maybe for good on a full session) and any pending
            // e-transfer record. Not undo-able, so ask.
            if (!(await confirmAction({
              title: 'Leave this session?',
              message: 'Your spot goes to someone else — if the session fills up you may not get it back.',
              confirmLabel: 'Leave session',
              cancelLabel: 'Stay in',
              destructive: true,
            }))) return
            startTransition(async () => {
              // Surface failures: this silently swallowed errors, so a Leave
              // that couldn't write looked identical to one that worked.
              const res = await safeAction(leaveSession(sessionId, leagueId))
              if (res?.error) { setError(res.error); return }
              router.refresh()
            })
          }}
          className="press min-h-10 px-4 rounded-md text-sm font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          {isPending ? 'Leaving…' : 'Leave'}
        </button>
        {error && <p role="alert" className="text-xs text-red-600 max-w-[12rem] text-right">{error}</p>}
      </div>
    )
  }

  if (isFull) {
    return (
      <span className="inline-flex items-center min-h-10 px-3 rounded-md text-sm font-medium text-red-600 bg-red-50 border border-red-200">
        Full
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            // "This session is full" (someone took the last spot), invite-only,
            // signed out… — say so instead of quietly flipping back to Join.
            const res = await joinSession(sessionId, leagueId)
            if (res?.error) { setError(res.error); router.refresh(); return }
            router.refresh()
          })
        }}
        className="press min-h-10 px-4 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-40"
      >
        {isPending ? 'Joining…' : 'Join'}
      </button>
      {error && <p role="alert" className="text-xs text-red-600 max-w-[12rem] text-right">{error}</p>}
    </div>
  )
}
