'use client'

import { useState, useTransition } from 'react'
import { recordEventInterest } from '@/actions/event-interest'

interface Props {
  leagueId: string
  source?: 'coming_soon' | 'events_list' | 'homepage'
}

/** Public "notify me when registration opens" capture. Works logged-out. */
export function NotifyMeForm({ leagueId, source = 'coming_soon' }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email.'); return }
    setError(null)
    startTransition(async () => {
      const res = await recordEventInterest({
        leagueId,
        email: email.trim(),
        name: name.trim() || undefined,
        source,
      })
      if (res.error) { setError(res.error); return }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 text-left">
        🎉 You&rsquo;re on the list — we&rsquo;ll email you the moment registration opens.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-left">
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1">
          <span className="sr-only">Your name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            autoComplete="name"
            className="w-full min-h-11 border rounded-md px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </label>
        <label className="flex-1">
          <span className="sr-only">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            className="w-full min-h-11 border rounded-md px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="press min-h-11 px-5 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60 whitespace-nowrap"
        >
          {pending ? 'Adding…' : 'Notify me'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-500">We&rsquo;ll only email you about this event. Unsubscribe anytime.</p>
    </form>
  )
}
