'use client'

import { useState, useTransition } from 'react'
import { selfCheckIn } from '@/actions/checkin'
import { formatGameTime } from '@/lib/format-time'

/**
 * The tap that checks a player in from their QR link. The page used to check
 * in on load — and the confirmation email links to it, so a mail scanner
 * pre-opening links (or the player tapping it from their inbox days early)
 * checked them in.
 */
export function TokenCheckinConfirm({ token, playerName, eventName, timezone }: {
  token: string
  playerName: string
  eventName: string | null
  timezone: string
}) {
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'done'; when?: string; already: boolean }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' })
  const [pending, startTransition] = useTransition()

  function checkIn() {
    startTransition(async () => {
      try {
        const res = await selfCheckIn(token)
        if (res.status === 'success') setState({ phase: 'done', already: false })
        else if (res.status === 'already_checked_in') setState({ phase: 'done', already: true, when: res.checkedInAt })
        else setState({ phase: 'error', message: "This check-in code isn't recognised. Ask an event organiser to check you in." })
      } catch {
        setState({ phase: 'error', message: "Couldn't reach the server — check your connection and try again." })
      }
    })
  }

  if (state.phase === 'done') {
    const f = state.when ? formatGameTime(state.when, timezone) : null
    return (
      <div role="status" className="fd-step-in bg-white rounded-2xl border p-8 shadow-sm">
        <div className={`w-16 h-16 rounded-full ${state.already ? 'bg-amber-100' : 'bg-green-100'} flex items-center justify-center mx-auto mb-4`}>
          <span className={`${state.already ? '' : 'fd-check-pop'} text-3xl`}>{state.already ? '⚠' : '✓'}</span>
        </div>
        <h1 className={`text-xl font-bold mb-1 ${state.already ? 'text-amber-800' : 'text-green-800'}`}>
          {state.already ? 'Already checked in' : 'Checked in!'}
        </h1>
        <p className="text-lg font-semibold mb-1">{playerName}</p>
        <p className="text-sm text-gray-500">
          {state.already && f ? `Checked in ${f.date} at ${f.time}` : "You're all set. Have a great game!"}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border p-8 shadow-sm space-y-4">
      {eventName && <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{eventName}</p>}
      <h1 className="text-xl font-bold text-gray-900">Check in {playerName}?</h1>
      {state.phase === 'error' && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <button
        type="button"
        onClick={checkIn}
        disabled={pending}
        className="press w-full min-h-12 rounded-xl text-base font-bold bg-brand-primary text-on-brand disabled:opacity-60"
      >
        {pending ? 'Checking in…' : '✓ Check in'}
      </button>
      <p className="text-xs text-gray-500">Tap when you arrive at the event.</p>
    </div>
  )
}
