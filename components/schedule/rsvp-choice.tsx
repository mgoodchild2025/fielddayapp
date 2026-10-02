'use client'

import { Check, X } from 'lucide-react'

export type RsvpStatus = 'in' | 'out'

/**
 * The one In / Out control (dashboard hero, same-day rows, schedule, event
 * page, game page). Same order and meaning everywhere: In first; a choice is
 * only filled once it's made (green In / red Out — semantic colours, not the
 * brand, which may itself be red or green); unchosen buttons are outlines so
 * nothing looks selected before it is. Saving, optimism and error toasts stay
 * with the caller.
 */
export function RsvpChoice({
  value,
  onChange,
  size = 'sm',
  disabled,
}: {
  value: RsvpStatus | null
  onChange: (next: RsvpStatus) => void
  /** md = "I'm in" / "Can't make it" (hero); sm = "In" / "Out" (rows). */
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const labels = size === 'md' ? { in: "I'm in", out: "Can't make it" } : { in: 'In', out: 'Out' }
  const base = 'press inline-flex items-center justify-center gap-1.5 min-h-10 min-w-14 px-3.5 rounded-lg text-sm font-semibold border select-none disabled:opacity-60'

  return (
    <div className="flex items-center gap-2" role="group" aria-label="RSVP">
      <button
        type="button"
        onClick={() => value !== 'in' && onChange('in')}
        disabled={disabled}
        aria-pressed={value === 'in'}
        className={`${base} ${
          value === 'in'
            ? 'bg-emerald-700 border-emerald-700 text-white shadow-sm'
            : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-500 hover:text-emerald-700'
        }`}
      >
        {value === 'in' && <Check className="w-4 h-4 fd-fade-in" strokeWidth={3} aria-hidden="true" />}
        {labels.in}
      </button>
      <button
        type="button"
        onClick={() => value !== 'out' && onChange('out')}
        disabled={disabled}
        aria-pressed={value === 'out'}
        className={`${base} ${
          value === 'out'
            ? 'bg-red-50 border-red-300 text-red-700'
            : 'bg-white border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-700'
        }`}
      >
        {value === 'out' && <X className="w-4 h-4 fd-fade-in" strokeWidth={3} aria-hidden="true" />}
        {labels.out}
      </button>
    </div>
  )
}
