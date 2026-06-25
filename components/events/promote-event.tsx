'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendAnnouncement } from '@/actions/messages'

type Audience = 'past_participants' | 'marketing' | 'event_interest'
type Channel = 'email' | 'sms' | 'both'

interface Props {
  leagueId: string
  eventName: string
  registerUrl: string
  canSms?: boolean
  interestCount?: number
  /** Subject/body of the last promo sent — prefilled so admins continue from it. */
  lastSubject?: string | null
  lastBody?: string | null
}

export function PromoteEventForm({ leagueId, eventName, registerUrl, canSms = false, interestCount = 0, lastSubject = null, lastBody = null }: Props) {
  const router = useRouter()
  const [audience, setAudience] = useState<Audience>('marketing')
  const [channel, setChannel] = useState<Channel>('email')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null)

  const defaultSubject = lastSubject || `${eventName} — Register Now`
  const defaultBody = lastBody || (
    `Registration for ${eventName} is open — don't miss your spot!\n\n` +
    `Register here: ${registerUrl}\n\n` +
    `See you on the court!`
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('league_id', leagueId)
    fd.set('message_class', 'commercial')
    setResult(null)
    startTransition(async () => {
      const res = await sendAnnouncement(fd)
      if (res.error) setResult({ error: res.error })
      else {
        setResult({ success: true })
        ;(e.target as HTMLFormElement).reset()
        setAudience('marketing')
        setChannel('email')
        router.refresh()  // surface the just-sent promo in "Recent promotions"
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
        Promotional (commercial) emails go only to people who have given marketing consent or signed
        up to be notified — each message includes a one-click unsubscribe link, as required by CASL.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
          <select
            name="audience_type"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="marketing">Marketing opt-ins (all events)</option>
            <option value="past_participants">Past participants</option>
            <option value="event_interest">Interested — notify-me list ({interestCount})</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="email">Email</option>
            {canSms && <option value="sms">SMS</option>}
            {canSms && <option value="both">Email + SMS</option>}
          </select>
        </div>
      </div>

      {audience === 'past_participants' && (
        <p className="text-xs text-gray-500 -mt-1">
          Reaches past participants who have <strong>also opted into marketing</strong> — those without
          consent are skipped automatically.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input
          name="title"
          required
          defaultValue={defaultSubject}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          name="body"
          required
          rows={7}
          defaultValue={defaultBody}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">Tip: keep the register link in the message so recipients can sign up in one tap.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
          <input name="scheduled_for" type="datetime-local" className="w-full border rounded-md px-3 py-2 text-sm" />
          <p className="text-xs text-gray-400 mt-1">Leave blank to send now.</p>
        </div>
        <label className="flex items-center gap-2 mt-7 text-sm text-gray-700">
          <input type="checkbox" name="cc_self" className="w-4 h-4 rounded border-gray-300" />
          Send me a copy
        </label>
      </div>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.success && <p className="text-sm text-green-700">Sent! 🎉 (or scheduled, if you set a time.)</p>}

      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? 'Sending…' : 'Send promotion'}
      </button>
    </form>
  )
}
