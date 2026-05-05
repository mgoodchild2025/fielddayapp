'use client'

import { useState } from 'react'
import { upsertWaiver, setWaiverActive, deleteWaiver } from '@/actions/waivers'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

interface Waiver {
  id: string
  title: string
  content: string
  version: number
  is_active: boolean
  created_at: string
  signature_count: number
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
        <WaiverCard
          key={waiver.id}
          waiver={waiver}
          editingId={editingId}
          setEditingId={setEditingId}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onActivated={handleActivated}
        />
      ))}
    </div>
  )
}

// ─── Waiver card ─────────────────────────────────────────────────────────────

interface WaiverCardProps {
  waiver: Waiver
  editingId: string | null
  setEditingId: (id: string | null) => void
  onUpdated: (w: Waiver) => void
  onDeleted: (id: string) => void
  onActivated: (id: string) => void
}

function WaiverCard({ waiver, editingId, setEditingId, onUpdated, onDeleted, onActivated }: WaiverCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{waiver.title}</span>
            <span className="text-xs text-gray-400">v{waiver.version}</span>
            {waiver.is_active && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
            )}
            {waiver.signature_count > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                {waiver.signature_count} signed
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(waiver.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!waiver.is_active && (
            <ActivateButton waiverId={waiver.id} onActivated={() => onActivated(waiver.id)} />
          )}
          <button
            onClick={() => setEditingId(editingId === waiver.id ? null : waiver.id)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50"
          >
            {editingId === waiver.id ? 'Cancel' : 'Edit'}
          </button>
          {!confirmingDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Inline delete confirm panel */}
      {confirmingDelete && (
        <div className="border-t px-5 py-4">
          <DeleteConfirmPanel
            waiverId={waiver.id}
            isActive={waiver.is_active}
            signatureCount={waiver.signature_count}
            onDeleted={() => onDeleted(waiver.id)}
            onCancel={() => setConfirmingDelete(false)}
          />
        </div>
      )}

      {/* Inline edit form */}
      {editingId === waiver.id && (
        <div className="border-t px-5 py-4 bg-gray-50">
          <WaiverForm
            waiver={waiver}
            onSaved={(w) => { onUpdated(w); setEditingId(null) }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}
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
    if (!content.trim() || content === '<p></p>') {
      setError('Waiver text is required.')
      return
    }
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
      signature_count: waiver?.signature_count ?? 0,
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
        <RichTextEditor
          content={content}
          onChange={setContent}
          minHeight="360px"
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

// ─── Delete confirm panel ─────────────────────────────────────────────────────

function DeleteConfirmPanel({
  waiverId,
  isActive,
  signatureCount,
  onDeleted,
  onCancel,
}: {
  waiverId: string
  isActive: boolean
  signatureCount: number
  onDeleted: () => void
  onCancel: () => void
}) {
  const [understood, setUnderstood] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await deleteWaiver(waiverId, signatureCount > 0)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    onDeleted()
  }

  return (
    <div className="border border-red-200 rounded-md p-3 bg-red-50 text-sm space-y-3">
      {signatureCount > 0 ? (
        <>
          <p className="text-red-700">
            ⚠️ This waiver has been signed by {signatureCount} player{signatureCount !== 1 ? 's' : ''}.
            Deleting it will permanently remove all signature records and cannot be undone.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span className="text-red-800 text-xs">I understand this will permanently delete all player signatures</span>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={!understood || loading}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '…' : 'Delete Permanently'}
            </button>
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-red-700">Are you sure? This cannot be undone.</p>
          {isActive && (
            <p className="text-xs text-red-600">Any leagues using this waiver will revert to &quot;No waiver required&quot;.</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? '…' : 'Delete'}
            </button>
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
