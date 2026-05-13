'use client'

import { useState, useRef } from 'react'
import {
  addLeagueDocument,
  updateLeagueDocumentTitle,
  deleteLeagueDocument,
  reorderLeagueDocuments,
} from '@/actions/league-documents'
import type { LeagueDocument } from '@/actions/league-documents'
import { FileText, Trash2, ChevronUp, ChevronDown, Plus, Pencil, Check, X } from 'lucide-react'
import { PdfViewerButton } from '@/components/ui/pdf-viewer-button'

const MAX_DOCS = 10

interface Props {
  leagueId: string
  initialDocuments: LeagueDocument[]
}

export function LeagueDocumentsManager({ leagueId, initialDocuments }: Props) {
  const [docs, setDocs] = useState<LeagueDocument[]>(initialDocuments)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAdded(doc: LeagueDocument) {
    setDocs((prev) => [...prev, doc])
    setAdding(false)
  }

  async function handleDelete(id: string) {
    const result = await deleteLeagueDocument(id)
    if (result.error) { setError(result.error); return }
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    const next = [...docs]
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    setDocs(next)
    await reorderLeagueDocuments(leagueId, next.map((d) => d.id))
  }

  function handleTitleUpdated(id: string, title: string) {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, title } : d))
  }

  const atLimit = docs.length >= MAX_DOCS

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {docs.length === 0 && !adding && (
        <p className="text-sm text-gray-400 text-center py-4">
          No documents yet. Add a PDF for players to download.
        </p>
      )}

      {/* Document list */}
      <div className="space-y-2">
        {docs.map((doc, i) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            isFirst={i === 0}
            isLast={i === docs.length - 1}
            onMove={(dir) => handleMove(i, dir)}
            onDelete={() => handleDelete(doc.id)}
            onTitleUpdated={(title) => handleTitleUpdated(doc.id, title)}
          />
        ))}
      </div>

      {/* Add form / button */}
      {adding ? (
        <AddDocumentForm
          leagueId={leagueId}
          onAdded={handleAdded}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setError(null); setAdding(true) }}
          disabled={atLimit}
          className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md border border-dashed text-gray-500 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          {atLimit ? `Maximum of ${MAX_DOCS} documents reached` : 'Add Document'}
        </button>
      )}

      <p className="text-xs text-gray-400">
        {docs.length}/{MAX_DOCS} documents · PDF only · max 10 MB each
      </p>
    </div>
  )
}

// ─── Single document row ──────────────────────────────────────────────────────

function DocumentRow({
  doc,
  isFirst,
  isLast,
  onMove,
  onDelete,
  onTitleUpdated,
}: {
  doc: LeagueDocument
  isFirst: boolean
  isLast: boolean
  onMove: (dir: 'up' | 'down') => void
  onDelete: () => void
  onTitleUpdated: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(doc.title)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function saveTitle() {
    if (!draft.trim() || draft === doc.title) { setEditing(false); return }
    setSaving(true)
    await updateLeagueDocumentTitle(doc.id, draft)
    onTitleUpdated(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 bg-white border rounded-md px-3 py-2.5 group">
      {/* Reorder buttons */}
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={() => onMove('up')}
          disabled={isFirst}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors"
          title="Move up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          disabled={isLast}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors"
          title="Move down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <FileText className="w-4 h-4 shrink-0 text-red-400" />

      {/* Title — editable inline */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditing(false) }}
              className="flex-1 min-w-0 border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button type="button" onClick={saveTitle} disabled={saving} className="text-green-600 hover:text-green-700">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => { setDraft(doc.title); setEditing(false) }} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-sm font-medium truncate block">{doc.title}</span>
        )}
      </div>

      {/* Actions */}
      {!editing && !confirmDelete && (
        <div className="flex items-center gap-1 shrink-0">
          <PdfViewerButton url={doc.file_url} label={doc.title} variant="icon" />
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline delete confirm */}
      {confirmDelete && (
        <div className="flex items-center gap-2 shrink-0 text-sm">
          <span className="text-red-600 text-xs">Remove?</span>
          <button
            type="button"
            onClick={() => { setConfirmDelete(false); onDelete() }}
            className="text-xs font-semibold text-red-600 hover:text-red-700"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Add document form ────────────────────────────────────────────────────────

function AddDocumentForm({
  leagueId,
  onAdded,
  onCancel,
}: {
  leagueId: string
  onAdded: (doc: LeagueDocument) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileDataRef = useRef<File | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    fileDataRef.current = f
    setFileName(f?.name ?? null)
    // Auto-fill title from filename if blank
    if (f && !title.trim()) {
      setTitle(f.name.replace(/\.pdf$/i, ''))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const file = fileDataRef.current
    if (!file) { setError('Please choose a file'); return }

    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await addLeagueDocument(leagueId, title, fd)
    setLoading(false)

    if (result.error) { setError(result.error); return }

    // Optimistically build a doc row for the UI (server will have the real ID/URL,
    // but since revalidatePath refreshes the server component the real data comes next nav)
    onAdded({
      id: crypto.randomUUID(),
      title: title.trim() || file.name.replace(/\.pdf$/i, ''),
      file_url: '#', // placeholder — real URL set on next page load
      sort_order: 999,
      created_at: new Date().toISOString(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-md p-3 bg-gray-50 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Document Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Rulebook, Playoff Schedule, Venue Map"
          className="input w-full text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">PDF File</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 text-sm border rounded-md bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            Choose file
          </button>
          <span className="text-sm text-gray-500 truncate">
            {fileName ?? 'No file chosen'}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Uploading…' : 'Upload'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-md text-sm border hover:bg-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
