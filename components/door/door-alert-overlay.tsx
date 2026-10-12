'use client'

import { alertHeadline } from '@/lib/door/logic'
import { DISPLAY_TYPE } from './door-stripes'

export type AlertRing = { ringId: string; visitorName: string | null; createdAt: string }

/**
 * The full-screen door alert: red/white flash at 1 Hz (solid under reduced
 * motion), who's at the door, and ON MY WAY. Used by the door screen and by
 * the in-app alert that shows over any Fieldday page (DoorWatcher).
 */
export function DoorAlertOverlay({
  stationName, rings, test, acking, onMyWay, fmtTime, ago, children,
}: {
  stationName: string
  rings: AlertRing[]
  test: boolean
  acking: boolean
  onMyWay: () => void
  fmtTime: (iso: string) => string
  ago: (iso: string) => string
  /** Extra actions under ON MY WAY (the in-app alert: Open door screen, Hide). */
  children?: React.ReactNode
}) {
  const headline = test ? 'Test alert' : alertHeadline(rings.map((r) => r.visitorName))
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="door-alert-title" className="door-flash fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 px-6 text-center pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <style>{`
        @keyframes door-flash { 0%, 49.9% { background: #DC2626; color: #fff } 50%, 100% { background: #fff; color: #B91C1C } }
        .door-flash { animation: door-flash 1s steps(1, end) infinite; background: #DC2626; color: #fff }
        @media (prefers-reduced-motion: reduce) { .door-flash { animation: none } }
      `}</style>
      <p className="text-sm font-bold uppercase tracking-[0.3em]">{test ? 'Test · nobody is at the door' : stationName}</p>
      <h2 id="door-alert-title" className={`${DISPLAY_TYPE} text-[clamp(3rem,13vw,9rem)] break-words`}>{headline}</h2>
      <ul className="text-xl font-semibold">
        {rings.map((r) => (
          <li key={r.ringId}>{r.visitorName ?? 'Visitor'} · {fmtTime(r.createdAt)} ({ago(r.createdAt)})</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onMyWay}
        disabled={acking}
        autoFocus
        className={`press min-h-24 w-full max-w-md rounded-3xl bg-black px-8 text-4xl text-white shadow-2xl ring-4 ring-white disabled:opacity-70 ${DISPLAY_TYPE}`}
      >
        {test ? 'Close test' : acking ? 'Sending…' : 'On my way'}
      </button>
      {children}
    </div>
  )
}
