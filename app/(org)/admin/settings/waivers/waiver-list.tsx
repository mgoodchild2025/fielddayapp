'use client'

import { useState } from 'react'
import { upsertWaiver, setWaiverActive, deleteWaiver } from '@/actions/waivers'

interface Waiver {
  id: string
  title: string
  content: string
  version: number
  is_active: boolean
  created_at: string
}

interface Props {
  waivers: Waiver[]
}

export function WaiverList({ waivers: initial }: Props) {
  const [waivers, setWaivers] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleUpdated(updated: Waiver) {
    setWaivers((prev) => {
      const exists = prev.find((w) => w.id === updated.id)
      if (exists) return prev.map((w) => w.id === updated.id ? updated : w)
      return [updated, ...prev]
    })
  }

  function handleDeleted(id: string) {
    setWaivers((prev) => prev.filter((w) => w.id !== id))
  }

  function handleActivated(id: string) {
    setWaivers((prev) => prev.map((w) => ({ ...w, is_active: w.id === id })))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => { setCreating(true); setEditingId(null) }}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          + New Waiver
        </button>
      </div>

      {creating && (
        <WaiverForm
          waiver={null}
          onSaved={(w) => { handleUpdated(w); setCreating(false) }}
          onCancel={() => setCreating(false)}
        />
      )}

      {waivers.length === 0 && !creating && (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          No waivers yet. Create one above.
        </div>
      )}

      {waivers.map((waiver) => (
        <div key={waiver.id} className="bg-white rounded-lg border overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{waiver.title}</span>
                <span className="text-xs text-gray-400">v{waiver.version}</span>
                {waiver.is_active && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Created {new Date(waiver.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!waiver.is_active && (
                <ActivateButton waiverId={waiver.id} onActivated={() => handleActivated(waiver.id)} />
              )}
              <button
                onClick={() => setEditingId(editingId === waiver.id ? null : waiver.id)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50"
              >
                {editingId === waiver.id ? 'Cancel' : 'Edit'}
              </button>
              <DeleteWaiverButton
                waiverId={waiver.id}
                isActive={waiver.is_active}
                onDeleted={() => handleDeleted(waiver.id)}
              />
            </div>
          </div>

          {/* Inline edit form */}
          {editingId === waiver.id && (
            <div className="border-t px-5 py-4 bg-gray-50">
              <WaiverForm
                waiver={waiver}
                onSaved={(w) => { handleUpdated(w); setEditingId(null) }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Inline form ──────────────────────────────────────────────────────────────

interface FormProps {
  waiver: Waiver | null
  onSaved: (w: Waiver) => void
  onCancel: () => void
}

function WaiverForm({ waiver, onSaved, onCancel }: FormProps) {
  const [title, setTitle] = useState(waiver?.title ?? '')
  const [content, setContent] = useState(waiver?.content ?? '')
  const [makeActive, setMakeActive] = useState(!waiver) // new waivers default to active
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await upsertWaiver({ id: waiver?.id, title, content })
    setLoading(false)

    if (result.error) { setError(result.error); return }

    // Activate if requested (and this is a new waiver, or user toggled it)
    const savedId = result.data!.id
    if (makeActive) {
      await setWaiverActive(savedId, true)
    }

    onSaved({
      id: savedId,
      title,
      content,
      version: waiver ? waiver.version + 1 : 1,
      is_active: makeActive || (waiver?.is_active ?? false),
      created_at: waiver?.created_at ?? new Date().toISOString(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Liability Waiver & Release of Claims"
          className="input"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Waiver Text</label>
        <p className="text-xs text-gray-400 mb-1">Players must scroll to the bottom before they can sign.</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          required
          placeholder="By signing this waiver, I acknowledge that..."
          className="input font-mono text-xs leading-relaxed resize-y"
        />
      </div>

      {!waiver?.is_active && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={makeActive}
            onChange={(e) => setMakeActive(e.target.checked)}
            className="rounded"
          />
          Set as active waiver (shown during registration)
        </label>
      )}

      {waiver?.is_active && (
        <p className="text-xs text-gray-500">
          This is the active waiver. Saving will bump it to v{waiver.version + 1}. Players who already signed will not need to re-sign.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Saving…' : waiver ? 'Save Changes' : 'Create Waiver'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-md text-sm font-semibold border hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Activate button ─────────────────────────────────────────────────────────

function ActivateButton({ waiverId, onActivated }: { waiverId: string; onActivated: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    await setWaiverActive(waiverId, true)
    onActivated()
    setLoading(false)
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 rounded hover:bg-green-50 disabled:opacity-50"
    >
      {loading ? '…' : 'Set active'}
    </button>
  )
}

// ─── Delete button ────────────────────────────────────────────────────────────

function DeleteWaiverButton({ waiverId, isActive, onDeleted }: { waiverId: string; isActive: boolean; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    const msg = isActive
      ? 'Delete this active waiver?\n\nAny leagues currently using it will revert to "No waiver required". This cannot be undone.'
      : 'Delete this waiver? Any leagues using it will revert to "No waiver required". This cannot be undone.'
    if (!confirm(msg)) return
    setLoading(true)
    const result = await deleteWaiver(waiverId)
    if (result.error) { alert(result.error); setLoading(false); return }
    onDeleted()
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
    >
      {loading ? '…' : 'Delete'}
    </button>
  )
}
