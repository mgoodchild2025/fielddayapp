'use client'

import { useState } from 'react'
import { upsertRuleTemplate, deleteRuleTemplate } from '@/actions/event-rules'

interface Template {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export function RuleTemplateList({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleSaved(t: Template) {
    setTemplates((prev) => {
      const exists = prev.find((x) => x.id === t.id)
      return exists ? prev.map((x) => x.id === t.id ? t : x) : [t, ...prev]
    })
  }

  function handleDeleted(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setCreating(true); setEditingId(null) }}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          + New Template
        </button>
      </div>

      {creating && (
        <TemplateForm
          template={null}
          onSaved={(t) => { handleSaved(t); setCreating(false) }}
          onCancel={() => setCreating(false)}
        />
      )}

      {templates.length === 0 && !creating && (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          No rule templates yet. Create one above.
        </div>
      )}

      {templates.map((t) => (
        <div key={t.id} className="bg-white rounded-lg border overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{t.title}</p>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.content.slice(0, 120)}{t.content.length > 120 ? '…' : ''}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Updated {new Date(t.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50"
              >
                {editingId === t.id ? 'Cancel' : 'Edit'}
              </button>
              <DeleteButton templateId={t.id} onDeleted={() => handleDeleted(t.id)} />
            </div>
          </div>

          {editingId === t.id && (
            <div className="border-t px-5 py-4 bg-gray-50">
              <TemplateForm
                template={t}
                onSaved={(updated) => { handleSaved(updated); setEditingId(null) }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function TemplateForm({
  template,
  onSaved,
  onCancel,
}: {
  template: Template | null
  onSaved: (t: Template) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(template?.title ?? '')
  const [content, setContent] = useState(template?.content ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await upsertRuleTemplate({ id: template?.id, title, content })
    setLoading(false)
    if (result.error) { setError(result.error); return }
    const now = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSaved({
      id: (result.data as any)!.id,
      title,
      content,
      created_at: template?.created_at ?? now,
      updated_at: now,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Beach Volleyball Rules"
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rules Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          required
          placeholder="1. All players must check in 15 minutes before game time.&#10;2. …"
          className="input font-mono text-xs leading-relaxed resize-y"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Saving…' : template ? 'Save Changes' : 'Create Template'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-md text-sm font-semibold border hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Delete button ────────────────────────────────────────────────────────────

function DeleteButton({ templateId, onDeleted }: { templateId: string; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (!confirm('Delete this template?\n\nLeagues using it will keep their rules content but the template link will be cleared.')) return
    setLoading(true)
    const result = await deleteRuleTemplate(templateId)
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
