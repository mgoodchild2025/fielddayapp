'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { checkInSelfForSession } from '@/actions/checkin'
import { unlockAudio, playCheckinSound } from '@/lib/audio'

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; icon: string; heading: string; body: string; success: boolean }

interface Props {
  sessionId: string
  leagueName: string
  sessionLabel: string
  playerName: string
  timezone: string
  checkinSound: string | null
}

export function SelfCheckinSessionClient({
  sessionId,
  leagueName,
  sessionLabel,
  playerName,
  timezone,
  checkinSound,
}: Props) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [, startTransition] = useTransition()

  function handleCheckin() {
    unlockAudio()
    setState({ phase: 'loading' })

    startTransition(async () => {
      const result = await checkInSelfForSession(sessionId)

      let icon: string
      let heading: string
      let body: string
      let success = false

      if (result.status === 'success') {
        icon = '✅'
        heading = "You're checked in!"
        body = `Welcome, ${result.playerName}. See you out there!`
        success = true
        playCheckinSound(checkinSound)
      } else if (result.status === 'already_checked_in') {
        const time = new Date(result.checkedInAt).toLocaleTimeString('en-CA', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        })
        icon = '✓'
        heading = 'Already checked in'
        body = `${result.playerName}, you checked in at ${time}. You're all set!`
      } else if (result.status === 'not_registered') {
        icon = '🚫'
        heading = 'Not registered for this session'
        body = result.playerName
          ? `${result.playerName}, you haven't joined this session yet. Register on the event page first.`
          : "You haven't joined this session yet. Register on the event page first."
      } else {
        icon = '⚠️'
        heading = 'Something went wrong'
        body = 'Please see the event staff.'
      }

      setState({ phase: 'done', icon, heading, body, success })
    })
  }

  return (
    <div className="w-full max-w-sm">

      {/* Pre-tap: prompt card */}
      {state.phase === 'idle' && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{leagueName}</p>
            <p className="text-sm text-gray-500">{sessionLabel}</p>
            <p className="text-lg font-semibold text-gray-800 mt-2">Welcome, {playerName}</p>
          </div>
          <button
            onClick={handleCheckin}
            className="w-full py-4 rounded-xl text-lg font-bold text-white transition-opacity hover:opacity-90 active:opacity-75"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            ✓ Tap to Check In
          </button>
        </div>
      )}

      {/* Loading */}
      {state.phase === 'loading' && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-500">Checking you in…</p>
        </div>
      )}

      {/* Result */}
      {state.phase === 'done' && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
          <div className="text-5xl">{state.icon}</div>
          <div>
            <h1 className={`text-xl font-bold ${state.success ? 'text-green-700' : 'text-gray-800'}`}>
              {state.heading}
            </h1>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{state.body}</p>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-700">{leagueName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sessionLabel}</p>
          </div>
          <Link
            href="/schedule"
            className="inline-block mt-2 text-sm font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Go to My Games →
          </Link>
        </div>
      )}

    </div>
  )
}
