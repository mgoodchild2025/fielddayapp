'use client'

import { useState } from 'react'
import { setGlobalMaintenance } from '@/actions/platform-settings'

interface Props {
  initialEnabled: boolean
  initialMessage: string | null
  initialUntil: string | null  // ISO 8601 or null
}

export function GlobalMaintenanceForm({ initialEnabled, initialMessage, initialUntil }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [message, setMessage] = useState(initialMessage ?? '')
  const toLocalInput = (iso: string | null): string => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return ''
    }
  }
  const [until, setUntil] = useState(toLocalInput(initialUntil))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const untilIso = until ? new Date(until).toISOString() : null
    const result = await setGlobalMaintenance(
      enabled,
      message.trim() || null,
      untilIso,
    )

    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300">
            Put ALL organizations in maintenance mode
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Every org site shows the maintenance page. Platform admins bypass silently.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
            enabled ? 'bg-amber-500' : 'bg-gray-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Message + until */}
      <div className="space-y-3 border-t border-gray-700 pt-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Message <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="We're making some improvements. The site will be back online shortly."
            className="w-full text-sm bg-gray-700 border border-gray-600 text-gray-200 placeholder-gray-500 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
          <p className="text-xs text-gray-500 mt-0.5 text-right">{message.length}/280</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Estimated return time <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={until}
            onChange={e => setUntil(e.target.value)}
            className="text-sm bg-gray-700 border border-gray-600 text-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-green-400">Saved</span>}
      </div>
    </form>
  )
}
