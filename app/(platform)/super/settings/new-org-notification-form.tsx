'use client'

import { useState, useTransition } from 'react'
import { setNewOrgNotificationEmail } from '@/actions/platform-settings'

export function NewOrgNotificationForm({ current }: { current: string | null }) {
  const [email, setEmail] = useState(current ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setNewOrgNotificationEmail(email.trim() || null)
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">
          Notification email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. signups@fielddayapp.ca"
          className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-1.5">
          {email.trim()
            ? `New org signups will be sent to ${email.trim()}.`
            : 'Leave blank to send to all users with the Platform Admin role instead.'}
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {email.trim() && !isPending && (
          <button
            type="button"
            onClick={() => {
              setEmail('')
              start(async () => {
                await setNewOrgNotificationEmail(null)
                setSaved(true)
                setTimeout(() => setSaved(false), 3000)
              })
            }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  )
}
