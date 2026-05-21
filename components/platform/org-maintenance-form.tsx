'use client'

import { useState } from 'react'
import { setOrgMaintenance } from '@/actions/platform'

interface Props {
  orgId: string
  initialEnabled: boolean
  initialMessage: string | null
  initialUntil: string | null  // ISO 8601 or null
}

export function OrgMaintenanceForm({ orgId, initialEnabled, initialMessage, initialUntil }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [message, setMessage] = useState(initialMessage ?? '')
  // Convert ISO to datetime-local value (YYYY-MM-DDTHH:mm) for the input
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
    const result = await setOrgMaintenance(
      orgId,
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
          <p className="text-sm font-medium text-gray-900">Maintenance mode</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Visitors see a &quot;temporarily unavailable&quot; page. Platform admins bypass silently.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            enabled ? 'bg-amber-500' : 'bg-gray-200'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Message + until — only shown when enabled */}
      {enabled && (
        <div className="space-y-3 pl-0 border-t pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Message <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="We're making some improvements. The site will be back online shortly."
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-0.5 text-right">{message.length}/280</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Estimated return time <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={until}
              onChange={e => setUntil(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </form>
  )
}
