'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { uploadAdminDocument, getAdminDocumentUrl, deleteAdminDocument, type AdminDocument } from '@/actions/admin-documents'

const CATEGORY_LABELS: Record<AdminDocument['category'], string> = {
  permit: 'Permit',
  insurance: 'Insurance',
  contract: 'Contract',
  other: 'Other',
}

/**
 * Private admin document library (permits, insurance, contracts). Files live
 * in a private bucket; View opens a 10-minute signed URL. leagueId null =
 * the org-level library.
 */
export function AdminDocumentsCard({ leagueId, initialDocuments }: {
  leagueId: string | null
  initialDocuments: AdminDocument[]
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AdminDocument['category']>('permit')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Choose a file.'); return }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('name', name)
      fd.set('category', category)
      if (leagueId) fd.set('leagueId', leagueId)
      const res = await uploadAdminDocument(fd)
      if (res.error) { setError(res.error); return }
      setAdding(false); setName(''); setCategory('permit'); setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })
  }

  function view(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await getAdminDocumentUrl(id)
      if (res.error || !res.url) { setError(res.error ?? 'Could not open document'); return }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  function remove(id: string, docName: string) {
    if (!confirm(`Delete "${docName}"? The file is removed permanently.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteAdminDocument(id)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Admin documents</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Permits, insurance, contracts — private to admins, never shown to players.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}

      {adding && (
        <form onSubmit={submit} className="px-4 py-3 border-b bg-gray-50 space-y-2">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document name (e.g. Gym permit 2026)"
              className="flex-1 border rounded px-2 py-1.5 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AdminDocument['category'])}
              className="border rounded px-2 py-1.5 text-sm bg-white"
            >
              {(Object.keys(CATEGORY_LABELS) as AdminDocument['category'][]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.docx"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700"
          />
          <div className="flex items-center justify-end gap-2">
            {fileName && <span className="text-xs text-gray-400 truncate flex-1">{fileName}</span>}
            <button type="button" onClick={() => { setAdding(false); setError(null) }} className="px-3 py-1.5 rounded-md border text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {pending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}

      {initialDocuments.length === 0 && !adding ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">No documents yet — add permits, insurance, or contracts to keep them one tap away.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {initialDocuments.map((d) => (
            <li key={d.id} className="px-4 py-2.5 flex items-center gap-3">
              <FileText className="w-4 h-4 text-gray-300 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => view(d.id)}
                  disabled={pending}
                  className="text-sm font-medium text-gray-800 hover:underline underline-offset-2 truncate block max-w-full text-left disabled:opacity-50"
                >
                  {d.name}
                </button>
                <p className="text-xs text-gray-400">
                  {CATEGORY_LABELS[d.category]} · {new Date(d.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {d.uploaderName ? ` · ${d.uploaderName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id, d.name)}
                disabled={pending}
                className="text-gray-300 hover:text-red-500 disabled:opacity-40 p-2 -m-2 shrink-0"
                aria-label={`Delete ${d.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
