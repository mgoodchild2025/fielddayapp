'use client'

import { useTransition, useState, useRef } from 'react'
import { sendPlayerNotification } from '@/actions/players'

interface Props {
  userId: string
  phone?: string | null
  smsOptedIn?: boolean
  leagueName?: string
}

const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent'

export function SendNotificationForm({ userId, phone, smsOptedIn, leagueName }: Props) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viaSms, setViaSms] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const canSendSms = !!phone && !!smsOptedIn

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = fd.get('title') as string
    const body = fd.get('body') as string
    if (!title.trim()) return

    setError(null)
    setSent(false)

    startTransition(async () => {
      const res = await sendPlayerNotification(userId, title, body, viaSms, leagueName)
      if (res.error) {
        setError(res.error)
      } else {
        setSent(true)
        if (res.smsError) setError(`Notification sent, but SMS failed: ${res.smsError}`)
        formRef.current?.reset()
        setViaSms(false)
        if (!res.smsError) setTimeout(() => setSent(false), 3000)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
        <input name="title" required placeholder="Notification title" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
        <textarea
          name="body"
          rows={3}
          placeholder="Optional message body…"
          className={inputClass + ' resize-none'}
        />
      </div>

      <div className="border-t pt-3">
        {canSendSms ? (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={viaSms}
              onChange={(e) => setViaSms(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-600">
              Also send via SMS <span className="text-gray-400">({phone})</span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-gray-400">
            {!phone
              ? 'No phone number on file — SMS unavailable.'
              : 'Player has not opted in to SMS notifications.'}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Sending…' : 'Send Notification'}
        </button>
        {sent && <span className="text-sm text-green-600">Sent</span>}
      </div>
    </form>
  )
}
