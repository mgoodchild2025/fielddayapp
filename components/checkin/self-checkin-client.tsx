'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { checkInSelfForEvent } from '@/actions/checkin'
import { unlockAudio, playCheckinSound } from '@/lib/audio'
import { CaptainCheckinButton } from '@/components/checkin/captain-checkin-button'

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; icon: string; heading: string; body: string; success: boolean; retry?: boolean }

interface Props {
  leagueId: string
  leagueName: string
  playerName: string
  timezone: string
  checkinSound: string | null
  captainTeamId: string | null
  captainTeamName: string | null
}

export function SelfCheckinClient({
  leagueId,
  leagueName,
  playerName,
  timezone,
  checkinSound,
  captainTeamId,
  captainTeamName,
}: Props) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [, startTransition] = useTransition()

  function handleCheckin() {
    // The tap IS the user gesture — unlock audio right now so playback is allowed
    unlockAudio()
    setState({ phase: 'loading' })

    startTransition(async () => {
      // A dropped connection at the door used to leave the spinner up for good
      // — show the failure and let them try again.
      let result: Awaited<ReturnType<typeof checkInSelfForEvent>>
      try {
        result = await checkInSelfForEvent(leagueId)
      } catch {
        setState({ phase: 'done', icon: '📶', heading: "Couldn't reach the server", body: 'Check your connection and try again.', success: false, retry: true })
        return
      }

      let icon: string
      let heading: string
      let body: string
      let success = false
      let retry = false

      if (result.status === 'success') {
        icon = '✅'
        heading = "You're checked in!"
        body = `Welcome, ${result.playerName}. Enjoy ${leagueName}!`
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
        heading = 'Not registered'
        body = result.playerName
          ? `${result.playerName}, we couldn't find a registration for you in ${leagueName}. Please see the event staff.`
          : `We couldn't find a registration for you in ${leagueName}. Please see the event staff.`
      } else {
        icon = '⚠️'
        heading = 'Something went wrong'
        body = 'Try again, or see the event staff.'
        retry = true
      }

      setState({ phase: 'done', icon, heading, body, success, retry })
    })
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Always mounted, so the outcome is announced (a freshly inserted
          result card often isn't). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {state.phase === 'loading' ? 'Checking you in…' : state.phase === 'done' ? `${state.heading}. ${state.body}` : ''}
      </p>

      {/* Pre-tap: prompt card */}
      {state.phase === 'idle' && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">{leagueName}</p>
            <p className="text-lg font-semibold text-gray-800">Welcome, {playerName}</p>
          </div>
          <button
            onClick={handleCheckin}
            className="w-full py-4 rounded-xl text-lg font-bold text-white transition-opacity hover:opacity-90 active:opacity-75 active:opacity-75"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            ✓ Tap to Check In
          </button>
        </div>
      )}

      {/* Loading */}
      {state.phase === 'loading' && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
          <div className="text-4xl motion-safe:animate-pulse">⏳</div>
          <p className="text-sm text-gray-500">Checking you in…</p>
        </div>
      )}

      {/* Result */}
      {state.phase === 'done' && (
        <>
          <div className="fd-step-in bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
            <div className="text-5xl"><span className={state.success ? 'fd-check-pop' : undefined}>{state.icon}</span></div>
            <div>
              <h1 className={`text-xl font-bold ${state.success ? 'text-green-700' : 'text-gray-800'}`}>
                {state.heading}
              </h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{state.body}</p>
            </div>
            {state.retry && (
              <button
                type="button"
                onClick={handleCheckin}
                className="press w-full min-h-11 rounded-xl text-base font-semibold bg-brand-primary text-on-brand"
              >
                Try again
              </button>
            )}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{leagueName}</p>
            </div>
            <Link
              href="/schedule"
              className="inline-block mt-2 text-sm font-medium hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              Go to My Games →
            </Link>
          </div>

          {/* Captain team check-in — shown after successful check-in */}
          {state.success && captainTeamId && (
            <div className="bg-white rounded-2xl border shadow-sm p-5 text-center space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  You&apos;re a captain for {captainTeamName}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Check in your teammates while you&apos;re here
                </p>
              </div>
              <div className="flex justify-center">
                <CaptainCheckinButton
                  teamId={captainTeamId}
                  leagueId={leagueId}
                  timezone={timezone}
                  teamName={captainTeamName ?? undefined}
                />
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}
