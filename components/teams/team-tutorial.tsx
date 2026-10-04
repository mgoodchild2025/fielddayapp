'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { scrollBehavior } from '@/lib/motion'

interface Step {
  target: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    target: 'team-header',
    title: 'Welcome to your team! 👋',
    body: 'This is your command centre. Manage your roster, track your season, and keep players in the loop — all from here.',
  },
  {
    target: 'join-info',
    title: 'Share your join code',
    body: 'Give players this code or link to join your team directly — no email needed. Copy and drop it in a group chat to get everyone on board fast.',
  },
  {
    target: 'roster-notes',
    title: 'Plan your roster',
    body: 'Add players to your roster plan before they register. Great for pre-assigning roles and sending invites in one go when you\'re ready.',
  },
  {
    target: 'roster-section',
    title: 'Track registration status',
    body: 'Your active roster lives here. The coloured badges show who\'s registered, who still needs to pay, and who hasn\'t signed the waiver yet.',
  },
]

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function getOverlayRects(r: SpotlightRect, pad = 10) {
  const { top, left, width, height } = r
  const vw = window.innerWidth
  const vh = window.innerHeight
  const right = left + width
  const bottom = top + height
  return {
    top:    { top: 0,             left: 0,          width: vw,                    height: Math.max(0, top - pad) },
    bottom: { top: bottom + pad,  left: 0,          width: vw,                    height: Math.max(0, vh - bottom - pad) },
    left:   { top: top - pad,     left: 0,          width: Math.max(0, left - pad), height: height + pad * 2 },
    right:  { top: top - pad,     left: right + pad, width: Math.max(0, vw - right - pad), height: height + pad * 2 },
  }
}

function tooltipStyle(r: SpotlightRect): React.CSSProperties {
  const pad = 10
  const tooltipW = 288
  const tooltipH = 170
  const gap = 14
  const vw = window.innerWidth
  const vh = window.innerHeight

  const spaceBelow = vh - (r.top + r.height + pad)
  const spaceAbove = r.top - pad

  let top: number
  if (spaceBelow >= tooltipH + gap) {
    top = r.top + r.height + pad + gap
  } else if (spaceAbove >= tooltipH + gap) {
    top = r.top - pad - gap - tooltipH
  } else {
    // Not enough room above or below — place below anyway, clamp
    top = Math.min(r.top + r.height + pad + gap, vh - tooltipH - 16)
  }

  let left = r.left + r.width / 2 - tooltipW / 2
  left = Math.max(16, Math.min(left, vw - tooltipW - 16))

  return { position: 'fixed', top, left, width: tooltipW, zIndex: 9999 }
}

export function TeamTutorial({
  teamId,
  isManager,
}: {
  teamId: string
  isManager: boolean
}) {
  const [step, setStep] = useState(-1)
  const [spotRect, setSpotRect] = useState<SpotlightRect | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)

  const storageKey = `fieldday_team_tutorial_${teamId}`

  // Auto-start on first visit
  useEffect(() => {
    if (!isManager) return
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey)) return
    const timer = setTimeout(() => setStep(0), 600)
    return () => clearTimeout(timer)
  }, [isManager, storageKey])

  // Measure and scroll to target when step changes
  const measureStep = useCallback((s: number) => {
    if (s < 0 || s >= STEPS.length) return
    const el = document.querySelector<HTMLElement>(`[data-tutorial="${STEPS[s].target}"]`)
    if (!el) {
      // Target not in DOM — skip this step
      setStep(s + 1 < STEPS.length ? s + 1 : -1)
      if (s + 1 >= STEPS.length) localStorage.setItem(storageKey, '1')
      return
    }
    targetRef.current = el
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
    // First paint once the smooth scroll has mostly settled; the scroll
    // listener below keeps it glued to the target from then on.
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }, 350)
  }, [storageKey])

  useEffect(() => {
    if (step >= 0) measureStep(step)
    else setSpotRect(null)
  }, [step, measureStep])

  // Follow the target. The spotlight is position:fixed, so it was measured
  // once and drifted off as soon as the page scrolled (or a long smooth
  // scroll was still running). Re-read the rect once per frame on scroll and
  // resize — no scrollIntoView here, which would fight the user's scroll.
  useEffect(() => {
    if (step < 0) return
    let frame = 0
    function follow() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = targetRef.current
        if (!el || !el.isConnected) return
        const r = el.getBoundingClientRect()
        setSpotRect((prev) => (prev ? { top: r.top, left: r.left, width: r.width, height: r.height } : prev))
      })
    }
    window.addEventListener('scroll', follow, { passive: true, capture: true })
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, { capture: true })
      window.removeEventListener('resize', follow)
    }
  }, [step])

  function advance() {
    const next = step + 1
    if (next >= STEPS.length) {
      finish()
    } else {
      setSpotRect(null)
      setStep(next)
    }
  }

  function finish() {
    localStorage.setItem(storageKey, '1')
    setStep(-1)
    // Hand focus back to where it was before the tour took it.
    returnFocusRef.current?.focus?.()
    returnFocusRef.current = null
  }

  // A real dialog for keyboard and screen-reader users: focus lands on the
  // primary button each step, Escape ends the tour.
  const nextRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const visible = step >= 0 && !!spotRect
  useEffect(() => {
    if (!visible) return
    if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null
    nextRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step])

  if (step < 0 || !spotRect) return null

  const current = STEPS[step]
  const overlays = getOverlayRects(spotRect)

  return (
    <>
      {/* 4-panel spotlight overlay — blocks clicks outside the target. A stray
          tap on it no longer ends the tour; Skip / ✕ / Escape do. */}
      {(Object.values(overlays) as React.CSSProperties[]).map((style, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{ ...style, position: 'fixed', backgroundColor: 'rgba(0,0,0,0.58)', zIndex: 9990 }}
        />
      ))}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-labelledby="team-tutorial-title"
        aria-describedby="team-tutorial-body"
        style={tooltipStyle(spotRect)}
        className="bg-white rounded-2xl shadow-2xl p-5 border border-gray-100"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 id="team-tutorial-title" className="text-sm font-semibold text-gray-900 leading-snug">{current.title}</h2>
          <button
            onClick={finish}
            className="press shrink-0 -mt-2.5 -mr-2.5 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <p id="team-tutorial-body" className="text-sm text-gray-600 leading-relaxed mb-4">{current.body}</p>

        {/* Step dots */}
        <div aria-hidden="true" className="flex items-center justify-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === step ? 16 : 6,
                height: 6,
                backgroundColor: i === step ? 'var(--brand-primary)' : '#e5e7eb',
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{step + 1} of {STEPS.length}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              className="press min-h-10 px-3 text-xs text-gray-600 hover:text-gray-800"
            >
              Skip
            </button>
            <button
              ref={nextRef}
              onClick={advance}
              className="press min-h-10 px-4 rounded-lg text-xs font-semibold bg-brand-primary text-on-brand"
            >
              {step === STEPS.length - 1 ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
