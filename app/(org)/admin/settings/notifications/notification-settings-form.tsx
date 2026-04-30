'use client'

import { useState, useTransition } from 'react'
import {
  saveNotificationSettings,
  type NotificationSettings,
  type SmsReminder,
  TIMING_OPTIONS,
  DEFAULT_MESSAGES,
  MAX_MESSAGE_CHARS,
} from '@/actions/notification-settings'

type ReminderDraft = Omit<SmsReminder, 'id'> & { key: number }

let nextKey = 1

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [smsEnabled, setSmsEnabled] = useState(initial.smsGameRemindersEnabled)
  const [reminders, setReminders] = useState<ReminderDraft[]>(() =>
    initial.reminders.map((r) => ({ key: nextKey++, minutesBefore: r.minutesBefore, messageTemplate: r.messageTemplate, enabled: r.enabled }))
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const usedMinutes = new Set(reminders.map((r) => r.minutesBefore))
  const availableOptions = TIMING_OPTIONS.filter((o) => !usedMinutes.has(o.minutes))

  function addReminder() {
    const first = availableOptions[0]
    if (!first) return
    setReminders((prev) => [
      ...prev,
      { key: nextKey++, minutesBefore: first.minutes, messageTemplate: DEFAULT_MESSAGES[first.minutes] ?? '', enabled: true },
    ])
  }

  function updateReminder(key: number, patch: Partial<ReminderDraft>) {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        // When timing changes, swap in default message if the old message was a default
        if (patch.minutesBefore !== undefined && patch.minutesBefore !== r.minutesBefore) {
          const wasDefault = r.messageTemplate === (DEFAULT_MESSAGES[r.minutesBefore] ?? '')
          if (wasDefault) next.messageTemplate = DEFAULT_MESSAGES[patch.minutesBefore] ?? ''
        }
        return next
      })
    )
  }

  function removeReminder(key: number) {
    setReminders((prev) => prev.filter((r) => r.key !== key))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveNotificationSettings({
        smsGameRemindersEnabled: smsEnabled,
        reminders: reminders.map(({ minutesBefore, messageTemplate, enabled }) => ({
          minutesBefore,
          messageTemplate,
          enabled,
        })),
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Master toggle */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900">SMS Game Reminders</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatically text opted-in players before their scheduled game.
            </p>
          </div>
          <Toggle checked={smsEnabled} onChange={setSmsEnabled} />
        </div>
      </div>

      {/* Reminders list — only shown when master toggle is on */}
      {smsEnabled && (
        <>
          <div className="space-y-3">
            {reminders.length === 0 && (
              <div className="bg-white rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
                No reminders configured. Add one below.
              </div>
            )}

            {reminders.map((reminder) => {
              const charsLeft = MAX_MESSAGE_CHARS - reminder.messageTemplate.length
              const isOverLimit = charsLeft < 0
              const isNearLimit = charsLeft >= 0 && charsLeft <= 20

              // Build options: all timing options, marking used ones (except current)
              const timingOptions = TIMING_OPTIONS.map((o) => ({
                ...o,
                disabled: o.minutes !== reminder.minutesBefore && usedMinutes.has(o.minutes),
              }))

              return (
                <div
                  key={reminder.key}
                  className={`bg-white rounded-lg border divide-y ${!reminder.enabled ? 'opacity-60' : ''}`}
                >
                  {/* Header row: timing + per-reminder toggle + delete */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <select
                      value={reminder.minutesBefore}
                      onChange={(e) => updateReminder(reminder.key, { minutesBefore: Number(e.target.value) })}
                      className="flex-1 border rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2"
                    >
                      {timingOptions.map((o) => (
                        <option key={o.minutes} value={o.minutes} disabled={o.disabled}>
                          {o.label}{o.disabled ? ' (in use)' : ''}
                        </option>
                      ))}
                    </select>
                    <Toggle
                      checked={reminder.enabled}
                      onChange={(v) => updateReminder(reminder.key, { enabled: v })}
                    />
                    <button
                      type="button"
                      onClick={() => removeReminder(reminder.key)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      title="Remove reminder"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Message textarea */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-500">Message</label>
                      <span className={`text-xs tabular-nums ${isOverLimit ? 'text-red-500 font-semibold' : isNearLimit ? 'text-amber-500' : 'text-gray-400'}`}>
                        {reminder.messageTemplate.length}/{MAX_MESSAGE_CHARS}
                      </span>
                    </div>
                    <textarea
                      value={reminder.messageTemplate}
                      onChange={(e) => updateReminder(reminder.key, { messageTemplate: e.target.value })}
                      rows={2}
                      maxLength={MAX_MESSAGE_CHARS}
                      className={`w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 ${
                        isOverLimit ? 'border-red-300 focus:ring-red-200' : 'focus:ring-[var(--brand-primary)]/20'
                      }`}
                      placeholder="Message sent to players…"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Sent as: <span className="text-gray-500 italic">Your Org – League Name · {reminder.messageTemplate || '…'} · Reply STOP to unsubscribe.</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add reminder button */}
          {availableOptions.length > 0 && (
            <button
              type="button"
              onClick={addReminder}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors bg-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add reminder
            </button>
          )}

          <p className="text-xs text-gray-400">
            Only sent to players who have opted in to SMS notifications on their profile.
          </p>
        </>
      )}

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
