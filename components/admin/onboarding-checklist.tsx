'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { dismissOnboardingChecklist } from '@/actions/onboarding'

export type OnboardingChecklistData = {
  logoSet: boolean
  websiteConfigured: boolean
  eventCreated: boolean
}

const STEPS = [
  {
    key: 'portal',
    title: 'Access your Admin portal',
    description: "You're in — your dashboard is ready.",
    href: null,
  },
  {
    key: 'brand',
    title: 'Set up your brand',
    description: 'Upload your logo and configure your brand colours.',
    href: '/admin/settings/branding',
  },
  {
    key: 'website',
    title: 'Configure your website',
    description: 'Choose a theme and customise your public-facing site.',
    href: '/admin/settings/website',
  },
  {
    key: 'event',
    title: 'Create your first event',
    description: 'Set up a league, tournament, or drop-in session.',
    href: '/admin/events/new',
  },
] as const

export function OnboardingChecklist({ data }: { data: OnboardingChecklistData }) {
  const completedMap: Record<string, boolean> = {
    portal:  true,
    brand:   data.logoSet,
    website: data.websiteConfigured,
    event:   data.eventCreated,
  }

  const completedCount = Object.values(completedMap).filter(Boolean).length
  const allComplete    = completedCount === STEPS.length
  const pct            = Math.round((completedCount / STEPS.length) * 100)

  // Success banner — show briefly then unmount
  const [showSuccess, setShowSuccess] = useState(false)
  const [gone, setGone]               = useState(false)
  const [isPending, startTransition]  = useTransition()

  useEffect(() => {
    if (allComplete) {
      setShowSuccess(true)
      const t = setTimeout(() => setGone(true), 3000)
      return () => clearTimeout(t)
    }
  }, [allComplete])

  if (gone) return null

  function handleDismiss() {
    startTransition(async () => {
      await dismissOnboardingChecklist()
    })
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (showSuccess) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-4 transition-opacity duration-1000">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-xl">
          🎉
        </div>
        <div>
          <p className="font-semibold text-emerald-900">You're all set!</p>
          <p className="text-sm text-emerald-700 mt-0.5">Your platform is configured and ready for players.</p>
        </div>
      </div>
    )
  }

  // ── Checklist state ───────────────────────────────────────────────────────
  const firstIncompleteKey = STEPS.find(s => !completedMap[s.key])?.key ?? null

  return (
    <div className="bg-white border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-gray-900">Getting started</h2>
            <span className="text-xs text-gray-400 tabular-nums shrink-0">
              {completedCount} of {STEPS.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary, #f97316)' }}
            />
          </div>
        </div>
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          disabled={isPending}
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40 -mt-0.5"
          aria-label="Dismiss checklist"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-1">
        {STEPS.map((step) => {
          const complete  = completedMap[step.key]
          const isCurrent = step.key === firstIncompleteKey

          return (
            <div
              key={step.key}
              className={[
                'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                isCurrent ? 'bg-gray-50' : '',
              ].join(' ')}
            >
              {/* Circle / check */}
              <div className="shrink-0 mt-0.5">
                {complete ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className={[
                    'w-5 h-5 rounded-full border-2',
                    isCurrent ? 'border-orange-400' : 'border-gray-200',
                  ].join(' ')} />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={[
                  'text-sm leading-snug',
                  complete    ? 'text-gray-400 line-through' : '',
                  isCurrent   ? 'font-semibold text-gray-900' : 'font-medium text-gray-600',
                ].join(' ')}>
                  {step.title}
                </p>
                {!complete && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{step.description}</p>
                )}
              </div>

              {/* Go link */}
              {!complete && step.href && (
                <Link
                  href={step.href}
                  className={[
                    'shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors',
                    isCurrent
                      ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                      : 'text-gray-400 hover:text-gray-600',
                  ].join(' ')}
                  style={isCurrent ? { color: 'var(--brand-primary, #f97316)', backgroundColor: 'color-mix(in srgb, var(--brand-primary, #f97316) 8%, white)' } : {}}
                >
                  Go →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
