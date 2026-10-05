'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Plus, X } from 'lucide-react'
import {
  uploadExpenseAttachment, getAttachmentUrl, removeExpenseAttachment,
  type ReceiptKind, type ExpenseAttachment,
} from '@/actions/finances'
import { ATTACHMENT_LABELS } from '@/lib/finance-constants'
import { UploadStatus } from '@/components/ui/upload-status'
import { useUndoableRemove } from '@/components/ui/use-undoable-remove'

/**
 * Attachments on an expense / overhead row — any number of files (invoice,
 * receipt, contract…), each labelled. Files live in a private bucket; View
 * opens a short-lived signed URL.
 */
export function AttachmentsControl({ kind, expenseId, attachments }: {
  kind: ReceiptKind
  expenseId: string
  attachments: ExpenseAttachment[]
}) {
  const router = useRouter()
  const { isHidden, remove: removeWithUndo } = useUndoableRemove()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState<string>(attachments.length === 0 ? 'Receipt' : 'Invoice')
  const [uploadingFile, setUploadingFile] = useState<File | null>(null)

  function upload(file: File) {
    setError(null)
    setUploadingFile(file)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('kind', kind)
      fd.set('expenseId', expenseId)
      fd.set('label', label)
      fd.set('file', file)
      const res = await uploadExpenseAttachment(fd)
      setUploadingFile(null)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function view(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await getAttachmentUrl(id)
      if (res.error || !res.url) { setError(res.error ?? 'Could not open attachment'); return }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  // Hidden at once with Undo; the file is removed only when Undo expires.
  function remove(id: string, name: string) {
    setError(null)
    removeWithUndo(id, {
      label: `Removed ${name}`,
      commit: () => removeExpenseAttachment(id),
      onCommitted: () => router.refresh(),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
      />
      {attachments.filter((a) => !isHidden(a.id)).map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 whitespace-nowrap">
          <button type="button" onClick={() => view(a.id)} disabled={pending}
            className="inline-flex items-center gap-1 min-h-10 text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50">
            <Paperclip className="w-3.5 h-3.5" aria-hidden="true" /> {a.label ?? 'Attachment'}
          </button>
          <button type="button" onClick={() => remove(a.id, a.label ?? 'this attachment')} disabled={pending} aria-label={`Remove ${a.label ?? 'attachment'}`}
            className="press inline-flex items-center justify-center w-10 h-10 -mx-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="min-h-10 text-xs text-gray-600 bg-transparent border-0 pl-0 pr-5 focus:ring-0 cursor-pointer"
          aria-label="Attachment type"
        >
          {ATTACHMENT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pending}
          className="press inline-flex items-center gap-1 min-h-10 px-2.5 rounded-md border border-dashed border-gray-300 text-xs font-medium text-gray-600 hover:text-gray-900 hover:border-gray-400 disabled:opacity-50"
          title="Attach a file (JPEG, PNG, WebP, or PDF)">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {pending ? 'Uploading…' : 'Attach'}
        </button>
      </span>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      <UploadStatus active={!!uploadingFile} label={`Uploading ${label.toLowerCase()}`} file={uploadingFile} className="basis-full" />
    </div>
  )
}
