'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Overlay, useRetained } from '@/components/ui/overlay'
import { ConfettiBurst, makeConfetti, type ConfettiPiece } from '@/components/medals/medal-case'
import {
  milestonesReached, topMilestones, nextMilestone, milestonesToCelebrate,
  type Milestone, type MilestoneStats,
} from '@/lib/milestones'

/**
 * Milestones on the dashboard: the player's badges (highest rung of each
 * kind), the goal they're closest to ("5 more games to 50"), and a one-time
 * celebration when they pass a new one. Which milestones were celebrated is
 * remembered on this device only; the counts themselves are derived on the
 * server (career.milestoneStats).
 */
export function MilestoneStrip({ stats, orgName, storageKey }: {
  stats: MilestoneStats
  orgName: string
  /** Per site, so a player in two clubs is celebrated in each. */
  storageKey: string
}) {
  const reached = milestonesReached(stats, orgName)
  const badges = topMilestones(stats, orgName)
  const next = nextMilestone(stats, orgName)

  const [queue, setQueue] = useState<Milestone[]>([])
  const [confetti, setConfetti] = useState<ConfettiPiece[] | null>(null)
  const current = queue[0] ?? null
  const shown = useRetained(current)

  // After hydration (localStorage is browser-only): what's new since last visit?
  const reachedKey = reached.map((m) => m.id).join(',')
  useEffect(() => {
    if (!reachedKey) return
    let seen: Set<string> | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      seen = raw ? new Set(JSON.parse(raw) as string[]) : null
    } catch { /* private mode: celebrate nothing rather than everything every visit */ return }
    const fresh = milestonesToCelebrate(reached, seen)
    try { localStorage.setItem(storageKey, JSON.stringify(reached.map((m) => m.id))) } catch { /* ignore */ }
    if (fresh.length === 0) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // A beat after load so the page settles before the moment.
    const t = setTimeout(() => {
      setQueue(fresh)
      if (!reduced) setConfetti(makeConfetti())
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedKey, storageKey])

  function closeOne() {
    setConfetti(null)
    setQueue((q) => q.slice(1))
  }

  if (badges.length === 0 && !next) return null

  return (
    <div className="mt-4 max-w-md">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Milestones</p>
      {badges.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {badges.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setQueue([m])}
                className="press inline-flex items-center gap-1.5 min-h-10 rounded-full border bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
                aria-label={m.description}
              >
                <span aria-hidden>{m.icon}</span>{m.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-gray-700">Next: {next.milestone.icon} {next.milestone.title}</span>
            <span className="text-gray-500">{next.hint}</span>
          </div>
          <div
            className="mt-1 h-2 rounded-full bg-gray-200 overflow-hidden"
            role="progressbar"
            aria-label={`Progress to ${next.milestone.title}`}
            aria-valuemin={0}
            aria-valuemax={next.milestone.threshold}
            aria-valuenow={next.current}
          >
            <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.max(4, Math.round(next.progress * 100))}%` }} />
          </div>
        </div>
      )}

      <Overlay
        open={!!current}
        onClose={closeOne}
        label={shown ? `Milestone: ${shown.title}` : 'Milestone'}
        panelClassName="relative w-full max-w-sm rounded-2xl bg-white p-7 pt-9 text-center shadow-2xl"
      >
        {shown && (
          <>
            <div className="text-6xl leading-none" aria-hidden>{shown.icon}</div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[.14em] text-brand-ink">Milestone</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{shown.title}</p>
            <p className="mt-2 text-sm text-gray-600">{shown.description}</p>
            <button
              type="button"
              onClick={closeOne}
              data-autofocus
              className="press mt-5 min-h-11 w-full rounded-lg bg-brand-primary text-on-brand text-sm font-semibold"
            >
              {queue.length > 1 ? 'Next' : 'Nice!'}
            </button>
          </>
        )}
      </Overlay>
      {confetti && current && createPortal(
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
          <ConfettiBurst pieces={confetti} />
        </div>,
        document.body,
      )}
    </div>
  )
}
