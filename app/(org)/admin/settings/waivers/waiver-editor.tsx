'use client'

import { useState } from 'react'
import { upsertWaiver } from '@/actions/waivers'

interface Waiver {
  id: string
  title: string
  content: string
  version: number
  is_active: boolean
}

interface Props {
  existing: Waiver | null
}

export function WaiverEditor({ existing }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [content, setContent] = useState(existing?.content ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const isNew = !existing

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const result = await upsertWaiver({
      id: existing?.id,
      title,
      content,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">
            {isNew ? 'Create Waiver' : `Active Waiver — v${existing.version}`}
          </h2>
          {!isNew && (
            <p className="text-xs text-gray-400 mt-0.5">
              Saving changes will increment the version number. Players who already signed will not need to re-sign.
            </p>
          )}
        </div>
        {!isNew && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Active
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Waiver Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Liability Waiver & Release of Claims"
            required
            className="input"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Waiver Text</label>
          <p className="text-xs text-gray-400 mb-1">
            Players will see this in a scrollable box and must reach the bottom before signing.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={18}
            required
            placeholder="By signing this waiver, I acknowledge that..."
            className="input font-mono text-xs leading-relaxed resize-y"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && (
          <p className="text-sm text-green-600">
            {isNew ? 'Waiver created and set as active.' : 'Waiver updated.'}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Saving…' : isNew ? 'Create Waiver' : 'Save Changes'}
          </button>
          {!isNew && (
            <span className="text-xs text-gray-400">
              Saving will bump to v{existing.version + 1}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
