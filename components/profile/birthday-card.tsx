'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setMyBirthday } from '@/actions/birthday'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'
import { MONTHS, daysInMonth, formatBirthday } from '@/lib/birthday'

/**
 * Profile → "Your birthday": an optional month + day (never a year) for a
 * shout-out on the player's dashboard, and on event screens on the day when
 * their player card is showing there.
 */
export function BirthdayCard({ month: initialMonth, day: initialDay }: { month: number | null; day: number | null }) {
  const [saved, setSaved] = useState<{ month: number; day: number } | null>(
    initialMonth && initialDay ? { month: initialMonth, day: initialDay } : null,
  )
  const [month, setMonth] = useState<number | ''>(initialMonth ?? '')
  const [day, setDay] = useState<number | ''>(initialDay ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const maxDay = month ? daysInMonth(month) : 31
  const changed = (saved?.month ?? '') !== month || (saved?.day ?? '') !== day

  function save(value: { month: number; day: number } | null) {
    setError(null)
    start(async () => {
      const res = await safeAction(setMyBirthday(value))
      if (res.error) { setError(res.error); return }
      setSaved(value)
      if (!value) { setMonth(''); setDay('') }
      toast.success(value ? 'Birthday saved 🎂' : 'Birthday removed')
      announce(value ? 'Birthday saved' : 'Birthday removed')
    })
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your birthday</h2>
      <p className="mt-1 text-sm text-gray-600">
        Optional. Month and day only, never the year. We&apos;ll wish you a happy birthday on your home screen,
        and on the event screens that day if your player card is showing there.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-medium text-gray-600">
          Month
          <select
            value={month}
            onChange={(e) => {
              const m = e.target.value ? Number(e.target.value) : ''
              setMonth(m)
              if (m && day && day > daysInMonth(m)) setDay('')
            }}
            className="mt-1 min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-base sm:text-sm"
          >
            <option value="">—</option>
            {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-gray-600">
          Day
          <select
            value={day}
            onChange={(e) => setDay(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-base sm:text-sm"
          >
            <option value="">—</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !month || !day || !changed}
          onClick={() => month && day && save({ month, day })}
          className="press min-h-10 rounded-lg bg-brand-primary px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="press min-h-10 px-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Remove
          </button>
        )}
      </div>
      {saved && !changed && (
        <p className="mt-2 text-xs text-gray-500">Saved: {formatBirthday(saved.month, saved.day)}</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
