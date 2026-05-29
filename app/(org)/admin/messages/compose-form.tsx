'use client'

import { useState, useTransition } from 'react'
import { sendAnnouncement } from '@/actions/messages'
import { UpgradeBadge } from '@/components/ui/upgrade-prompt'

interface League {
  id: string
  name: string
}

type Channel = 'email' | 'sms' | 'both'

export function ComposeMessageForm({ leagues, canSms = false }: { leagues: League[]; canSms?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [audienceType, setAudienceType] = useState<'org' | 'league'>('org')
  const [channel, setChannel] = useState<Channel>('email')
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setResult(null)

    startTransition(async () => {
      const res = await sendAnnouncement(fd)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ success: true })
        ;(e.target as HTMLFormElement).reset()
        setAudienceType('org')
        setChannel('email')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Audience */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Send To</label>
          <select
            name="audience_type"
            value={audienceType}
            onChange={(e) => setAudienceType(e.target.value as 'org' | 'league')}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="org">All Members</option>
            <option value="league">Specific League</option>
          </select>
        </div>
        {audienceType === 'league' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
            <select name="league_id" required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select league…</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input
          name="title"
          type="text"
          required
          placeholder="e.g. Schedule update for Week 4"
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          name="body"
          required
          rows={5}
          placeholder="Write your announcement here…"
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Delivery channel */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="block text-sm font-medium text-gray-700">Send via</label>
          {!canSms && <UpgradeBadge requiredTier="pro" />}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Email — always available */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer select-none transition-colors ${
              channel === 'email' ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            style={channel === 'email' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input type="radio" name="channel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} className="sr-only" />
            ✉️ Email
          </label>

          {/* SMS — gated */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm select-none transition-colors ${
              !canSms
                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                : channel === 'sms'
                ? 'border-transparent text-white cursor-pointer'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer'
            }`}
            style={canSms && channel === 'sms' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input
              type="radio"
              name="channel"
              value="sms"
              checked={channel === 'sms'}
              onChange={() => canSms && setChannel('sms')}
              disabled={!canSms}
              className="sr-only"
            />
            💬 SMS
          </label>

          {/* Both — gated */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm select-none transition-colors ${
              !canSms
                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                : channel === 'both'
                ? 'border-transparent text-white cursor-pointer'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer'
            }`}
            style={canSms && channel === 'both' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input
              type="radio"
              name="channel"
              value="both"
              checked={channel === 'both'}
              onChange={() => canSms && setChannel('both')}
              disabled={!canSms}
              className="sr-only"
            />
            ✉️💬 Both
          </label>
        </div>
        {(channel === 'sms' || channel === 'both') && canSms ? (
          <p className="text-xs text-gray-400 mt-1.5">SMS is sent only to members who have opted in and have a phone number on file.</p>
        ) : null}
        {!canSms && (
          <p className="text-xs text-gray-400 mt-1.5">Upgrade to Pro to send SMS notifications.</p>
        )}
      </div>

      {/* CC options */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" name="cc_self" className="rounded border-gray-300" />
          Also send to myself
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" name="cc_admins" className="rounded border-gray-300" />
          Also send to event admins
        </label>
      </div>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.success && <p className="text-sm text-green-600">Announcement sent successfully!</p>}

      {/* Schedule */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
        <input
          name="scheduled_for"
          type="datetime-local"
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
        <p className="text-xs text-gray-400 mt-1">Leave blank to send immediately.</p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? 'Saving…' : 'Send / Schedule'}
      </button>
    </form>
  )
}
