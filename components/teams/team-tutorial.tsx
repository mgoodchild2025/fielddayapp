'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

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
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }, 350)
  }, [storageKey])

  useEffect(() => {
    if (step >= 0) measureStep(step)
    else setSpotRect(null)
  }, [step, measureStep])

  // Recompute rect on window resize
  useEffect(() => {
    if (step < 0) return
    function onResize() { measureStep(step) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [step, measureStep])

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
  }

  if (step < 0 || !spotRect) return null

  const current = STEPS[step]
  const overlays = getOverlayRects(spotRect)

  return (
    <>
      {/* 4-panel spotlight overlay — blocks clicks outside the target */}
      {(Object.values(overlays) as React.CSSProperties[]).map((style, i) => (
        <div
          key={i}
          style={{ ...style, position: 'fixed', backgroundColor: 'rgba(0,0,0,0.58)', zIndex: 9990 }}
          onClick={finish}
        />
      ))}

      {/* Tooltip card */}
      <div
        style={tooltipStyle(spotRect)}
        className="bg-white rounded-2xl shadow-2xl p-5 border border-gray-100"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{current.title}</p>
          <button
            onClick={finish}
            className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors -mt-0.5"
            aria-label="Close tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <p className="text-xs text-gray-500 leading-relaxed mb-4">{current.body}</p>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
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
          <span className="text-[11px] text-gray-400">{step + 1} of {STEPS.length}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1.5"
            >
              Skip
            </button>
            <button
              onClick={advance}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {step === STEPS.length - 1 ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
