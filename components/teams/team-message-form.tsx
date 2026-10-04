'use client'

import { useState } from 'react'
import { sendTeamMessage } from '@/actions/teams'
import { scrollBehavior } from '@/lib/motion'

interface Props {
  teamId: string
  memberCount: number
}

type Channel = 'email' | 'sms' | 'both'

export function TeamMessageForm({ teamId, memberCount }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState<Channel>('email')
  const [ccSelf, setCcSelf] = useState(false)
  const [ccAdmins, setCcAdmins] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'sent' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function reset() {
    setSubject('')
    setBody('')
    setChannel('email')
    setCcSelf(false)
    setCcAdmins(false)
    setResult(null)
    setErrorMsg(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setLoading(true)
    setResult(null)
    setErrorMsg(null)

    const res = await sendTeamMessage({ teamId, subject, body, channel, ccSelf, ccAdmins })
    if (res.error) {
      setErrorMsg(res.error)
      setResult('error')
    } else {
      setResult('sent')
      setSubject('')
      setBody('')
      window.scrollTo({ top: 0, behavior: scrollBehavior() })
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 2000)
    }
    setLoading(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press mt-3 w-full min-h-11 rounded-md text-sm font-medium border hover:bg-gray-50 text-gray-700"
      >
        ✉️ Message Team ({memberCount - 1} recipient{memberCount - 1 !== 1 ? 's' : ''})
      </button>
    )
  }

  return (
    <div className="mt-3 border rounded-md p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Message Team</p>
        <button
          onClick={() => { setOpen(false); reset() }}
          className="press -mr-2 -my-2 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {result === 'sent' && (
        <p className="text-xs text-green-600 font-medium mb-2">✓ Message sent to all team members!</p>
      )}
      {result === 'error' && errorMsg && (
        <p role="alert" className="text-xs text-red-600 mb-2">{errorMsg}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          required
          className="w-full min-h-10 border rounded px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <textarea
          placeholder="Message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
          rows={3}
          className="w-full border rounded px-3 py-2 text-base sm:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />

        {/* Channel */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Send via</p>
          <div className="flex gap-1.5">
            {(['email', 'sms', 'both'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`press flex-1 min-h-10 px-3 rounded text-xs font-medium border ${
                  channel === ch
                    ? 'text-white border-transparent'
                    : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-100'
                }`}
                style={channel === ch ? { backgroundColor: 'var(--brand-primary)' } : {}}
              >
                {ch === 'email' && '✉️ Email'}
                {ch === 'sms' && '💬 SMS'}
                {ch === 'both' && '✉️💬 Both'}
              </button>
            ))}
          </div>
          {(channel === 'sms' || channel === 'both') && (
            <p className="text-xs text-gray-500 mt-1">SMS sent to opted-in members with a phone number on file.</p>
          )}
        </div>

        {/* CC options */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 min-h-10 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ccSelf}
              onChange={(e) => setCcSelf(e.target.checked)}
              className="rounded border-gray-300"
            />
            Also send to myself
          </label>
          <label className="flex items-center gap-2 min-h-10 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ccAdmins}
              onChange={(e) => setCcAdmins(e.target.checked)}
              className="rounded border-gray-300"
            />
            Also send to event admins
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setOpen(false); reset() }}
            className="press min-h-10 px-3 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !subject.trim() || !body.trim()}
            className="press text-xs font-semibold text-white px-4 min-h-10 rounded transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
