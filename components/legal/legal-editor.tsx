'use client'

import { useState, useCallback, useTransition } from 'react'
import { saveDraft, publishDocument } from '@/actions/legal'
import { LegalDocumentContent } from './legal-document-content'
import type { LegalDocument } from '@/actions/legal'

interface Props {
  doc: LegalDocument
}

type Tab = 'edit' | 'preview'

export function LegalEditor({ doc }: Props) {
  const [content, setContent] = useState(doc.content)
  const [activeTab, setActiveTab] = useState<Tab>('edit')
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleChange = useCallback((val: string) => {
    setContent(val)
    setIsDirty(true)
    setSaveStatus('idle')
  }, [])

  const handleSaveDraft = useCallback(() => {
    startTransition(async () => {
      setSaveStatus('saving')
      const { error } = await saveDraft(doc.slug, content)
      if (error) {
        setSaveStatus('error')
        setSaveError(error)
      } else {
        setSaveStatus('saved')
        setIsDirty(false)
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    })
  }, [doc.slug, content])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'edit'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Preview
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Save status indicator */}
          {isDirty && saveStatus === 'idle' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-400">Saving…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-emerald-400">✓ Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">Save failed: {saveError}</span>
          )}

          <button
            onClick={handleSaveDraft}
            disabled={!isDirty || isPending}
            className="px-3 py-1.5 text-sm font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors"
          >
            Save draft
          </button>
          <button
            onClick={() => setShowPublishDialog(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
          >
            Publish…
          </button>
        </div>
      </div>

      {/* Editor / Preview area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full h-full p-6 bg-gray-950 text-gray-100 font-mono text-sm leading-relaxed resize-none focus:outline-none"
            placeholder="Write your document in Markdown…"
            spellCheck={false}
          />
        ) : (
          <div className="h-full overflow-y-auto bg-white p-8">
            <LegalDocumentContent content={content} />
          </div>
        )}
      </div>

      {/* Publish dialog */}
      {showPublishDialog && (
        <PublishDialog
          doc={doc}
          onClose={() => setShowPublishDialog(false)}
          content={content}
          onPublished={() => {
            setIsDirty(false)
            setSaveStatus('idle')
          }}
        />
      )}
    </div>
  )
}

// ── Publish Dialog ────────────────────────────────────────────────────────────

function PublishDialog({
  doc,
  onClose,
  content,
  onPublished,
}: {
  doc: LegalDocument
  onClose: () => void
  content: string
  onPublished: () => void
}) {
  // Suggest next version: bump patch of current, default to 1.0
  function suggestNextVersion(current: string | null): string {
    if (!current) return '1.0'
    const parts = current.split('.').map(Number)
    if (parts.length === 2) return `${parts[0]}.${parts[1] + 1}`
    return `${current}.1`
  }

  const [version, setVersion] = useState(suggestNextVersion(doc.version))
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handlePublish = () => {
    if (!version.trim()) {
      setError('Version is required')
      return
    }
    startTransition(async () => {
      const result = await publishDocument(doc.slug, {
        version: version.trim(),
        effectiveDate: effectiveDate || null,
        notes: notes.trim() || null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onPublished()
        onClose()
        // Reload to reflect published state
        window.location.reload()
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Publish document</h2>
          <p className="text-sm text-gray-500 mt-0.5">{doc.title}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0, 2.1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective date
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Release notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-amber-800 font-medium">This will immediately make the document public.</p>
            <p className="text-xs text-amber-700 mt-0.5">A version snapshot will be saved to the history and cannot be modified.</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={isPending || !version.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg transition-colors"
          >
            {isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
