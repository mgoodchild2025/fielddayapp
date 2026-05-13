'use client'

import { useState, useTransition, useRef } from 'react'
import { FileText, ExternalLink, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import {
  addUrlNavLink,
  addDocumentNavLink,
  updateNavLink,
  replaceNavLinkDocument,
  deleteNavLink,
  reorderNavLinks,
} from '@/actions/nav-links'
import type { NavLink } from '@/actions/nav-links'

const MAX_LINKS = 5

interface Props {
  initialLinks: NavLink[]
}

// ── Add / Edit form ────────────────────────────────────────────────────────────

interface FormState {
  label: string
  linkType: 'url' | 'document'
  url: string
  openInNewTab: boolean
  file: File | null
}

const EMPTY_FORM: FormState = {
  label: '',
  linkType: 'url',
  url: '',
  openInNewTab: true,
  file: null,
}

interface NavLinkFormProps {
  initial?: NavLink
  onSave: (state: FormState) => Promise<void>
  onCancel: () => void
  pending: boolean
  error: string | null
}

function NavLinkForm({ initial, onSave, onCancel, pending, error }: NavLinkFormProps) {
  const [state, setState] = useState<FormState>(() =>
    initial
      ? {
          label: initial.label,
          linkType: initial.link_type,
          url: initial.link_type === 'url' ? initial.url : '',
          openInNewTab: initial.open_in_new_tab,
          file: null,
        }
      : EMPTY_FORM
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const isEditing = !!initial

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  function handleTypeToggle(t: 'url' | 'document') {
    setState(prev => ({ ...prev, linkType: t, url: '', file: null }))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave(state)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Label */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
        <input
          type="text"
          value={state.label}
          onChange={e => set('label', e.target.value)}
          placeholder="e.g. Policies, Contact Us, News"
          maxLength={60}
          required
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Type toggle — only for new links; can't switch type on edit */}
      {!isEditing && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Link type</label>
          <div className="flex rounded-md border overflow-hidden w-fit">
            {(['url', 'document'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeToggle(t)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  state.linkType === t
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={state.linkType === t ? { backgroundColor: 'var(--brand-primary)' } : {}}
              >
                {t === 'url' ? 'URL' : 'Document (PDF)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* URL input */}
      {state.linkType === 'url' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
            <input
              type="url"
              value={state.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://"
              required={!isEditing || initial?.link_type === 'url'}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.openInNewTab}
              onChange={e => set('openInNewTab', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Open in new tab</span>
          </label>
        </>
      )}

      {/* Document file input — new links only */}
      {state.linkType === 'document' && !isEditing && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PDF file</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            required
            onChange={e => set('file', e.target.files?.[0] ?? null)}
            className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
          />
          <p className="text-xs text-gray-400 mt-1">PDF only · Max 10 MB</p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {pending ? 'Saving…' : isEditing ? 'Save changes' : 'Add link'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-md text-sm border text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main manager ───────────────────────────────────────────────────────────────

export function NavLinkManager({ initialLinks }: Props) {
  const [links, setLinks] = useState<NavLink[]>(initialLinks)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const [, startTransition] = useTransition()
  const [addPending, setAddPending] = useState(false)
  const [editPending, setEditPending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [replaceError, setReplaceError] = useState<string | null>(null)

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function handleAdd(state: FormState) {
    setFormError(null)
    setAddPending(true)
    let result: { error: string | null }

    if (state.linkType === 'document') {
      if (!state.file) { setFormError('Please select a PDF.'); setAddPending(false); return }
      const fd = new FormData()
      fd.append('label', state.label.trim())
      fd.append('file', state.file)
      result = await addDocumentNavLink(fd)
    } else {
      result = await addUrlNavLink(state.label.trim(), state.url.trim(), state.openInNewTab)
    }

    setAddPending(false)
    if (result.error) { setFormError(result.error); return }

    // Re-fetch by reloading (revalidatePath will have updated the server data)
    window.location.reload()
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  async function handleEdit(id: string, state: FormState) {
    setFormError(null)
    setEditPending(true)
    const result = await updateNavLink(id, {
      label: state.label,
      ...(state.linkType === 'url' ? { url: state.url, open_in_new_tab: state.openInNewTab } : {}),
    })
    setEditPending(false)
    if (result.error) { setFormError(result.error); return }
    setLinks(prev => prev.map(l =>
      l.id === id
        ? { ...l, label: state.label.trim(), ...(state.linkType === 'url' ? { url: state.url.trim(), open_in_new_tab: state.openInNewTab } : {}) }
        : l
    ))
    setEditingId(null)
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    setGlobalError(null)
    setDeletePending(true)
    startTransition(async () => {
      const result = await deleteNavLink(id)
      setDeletePending(false)
      if (result.error) { setGlobalError(result.error); return }
      setLinks(prev => prev.filter(l => l.id !== id))
      setConfirmDeleteId(null)
    })
  }

  // ── Reorder ──────────────────────────────────────────────────────────────────

  function move(index: number, direction: -1 | 1) {
    const newLinks = [...links]
    const target = index + direction
    if (target < 0 || target >= newLinks.length) return
    ;[newLinks[index], newLinks[target]] = [newLinks[target], newLinks[index]]
    setLinks(newLinks)
    setReorderPending(true)
    startTransition(async () => {
      await reorderNavLinks(newLinks.map(l => l.id))
      setReorderPending(false)
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const atCap = links.length >= MAX_LINKS

  return (
    <div className="space-y-4">
      {globalError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {globalError}
        </div>
      )}

      {/* Existing links */}
      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={link.id} className="bg-white border rounded-xl px-4 py-3.5 space-y-3">
              {editingId === link.id ? (
                <>
                  <NavLinkForm
                    initial={link}
                    onSave={(state) => handleEdit(link.id, state)}
                    onCancel={() => { setEditingId(null); setFormError(null) }}
                    pending={editPending}
                    error={formError}
                  />

                  {/* Document replace — shown in edit mode for document links */}
                  {link.link_type === 'document' && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-gray-600 mb-1">Replace PDF</p>
                      <ReplaceDocField
                        link={link}
                        onReplaced={(url) => setLinks(prev => prev.map(l => l.id === link.id ? { ...l, url } : l))}
                        error={replaceError}
                        setError={setReplaceError}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{link.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {link.link_type === 'document'
                        ? <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        : <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      }
                      <p className="text-xs text-gray-400 truncate">
                        {link.link_type === 'document' ? 'PDF document' : link.url}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || reorderPending}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 transition-colors"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === links.length - 1 || reorderPending}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 transition-colors"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(link.id); setFormError(null); setConfirmDeleteId(null) }}
                      className="px-2.5 py-1 text-xs border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>

                    {confirmDeleteId === link.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(link.id)}
                          disabled={deletePending}
                          className="px-2.5 py-1 text-xs rounded-md font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          {deletePending ? '…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 text-xs border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteId(link.id); setEditingId(null) }}
                        className="px-2.5 py-1 text-xs border border-red-200 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {links.length === 0 && !adding && (
        <div className="bg-white border border-dashed rounded-xl p-8 text-center space-y-1">
          <p className="text-sm font-medium text-gray-500">No custom links yet</p>
          <p className="text-xs text-gray-400">Add links to your nav bar below.</p>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-white border rounded-xl px-4 py-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">New link</p>
          <NavLinkForm
            onSave={handleAdd}
            onCancel={() => { setAdding(false); setFormError(null) }}
            pending={addPending}
            error={formError}
          />
        </div>
      )}

      {/* Add button / cap message */}
      {!adding && (
        atCap ? (
          <p className="text-sm text-gray-400 text-center py-2">
            Maximum of {MAX_LINKS} links reached.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setGlobalError(null) }}
            className="w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-medium text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
          >
            + Add link
          </button>
        )
      )}
    </div>
  )
}

// ── ReplaceDocField — inline PDF replacement for editing a document link ───────

function ReplaceDocField({
  link,
  onReplaced,
  error,
  setError,
}: {
  link: NavLink
  onReplaced: (url: string) => void
  error: string | null
  setError: (e: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.append('pdf', file)
    const boundAction = replaceNavLinkDocument.bind(null, link.id)
    startTransition(async () => {
      const result = await boundAction(fd)
      if (result.error) setError(result.error)
      else if (result.url) onReplaced(result.url)
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <FileText className="w-4 h-4 shrink-0" />
        View current PDF
      </a>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleChange} disabled={pending} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={pending}
        className="text-xs px-2.5 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Uploading…' : 'Replace PDF'}
      </button>
      <p className="text-xs text-gray-400 w-full">PDF only · Max 10 MB</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
