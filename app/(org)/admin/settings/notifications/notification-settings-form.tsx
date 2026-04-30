'use client'

import { useState, useTransition } from 'react'
import { saveNotificationSettings, type NotificationSettings } from '@/actions/notification-settings'

const HOURS_OPTIONS = [
  { value: 1, label: '1 hour before' },
  { value: 2, label: '2 hours before' },
  { value: 3, label: '3 hours before' },
  { value: 6, label: '6 hours before' },
  { value: 12, label: '12 hours before' },
  { value: 24, label: '24 hours before' },
]

export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [smsEnabled, setSmsEnabled] = useState(initial.smsGameRemindersEnabled)
  const [hoursBefore, setHoursBefore] = useState(initial.smsReminderHoursBefore)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveNotificationSettings({
        smsGameRemindersEnabled: smsEnabled,
        smsReminderHoursBefore: hoursBefore,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* SMS Game Reminders */}
      <div className="bg-white rounded-lg border divide-y">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-gray-900">SMS Game Reminders</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Automatically text opted-in players before their scheduled game.
              </p>
            </div>
            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={smsEnabled}
              onClick={() => setSmsEnabled((v) => !v)}
              className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                smsEnabled ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
              }`}
              style={{ focusRingColor: 'var(--brand-primary)' } as React.CSSProperties}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  smsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Timing — only visible when enabled */}
        <div
          className={`px-5 transition-all duration-200 ${
            smsEnabled ? 'py-5 opacity-100' : 'py-0 opacity-0 pointer-events-none overflow-hidden max-h-0'
          }`}
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Send reminder
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {HOURS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setHoursBefore(opt.value)}
                className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  hoursBefore === opt.value
                    ? 'border-[var(--brand-primary)] text-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Only sent to players who have opted in to SMS notifications on their profile.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  )
}
