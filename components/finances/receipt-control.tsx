'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Plus, X } from 'lucide-react'
import {
  uploadExpenseAttachment, getAttachmentUrl, removeExpenseAttachment,
  type ReceiptKind, type ExpenseAttachment,
} from '@/actions/finances'
import { ATTACHMENT_LABELS } from '@/lib/finance-constants'

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
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState<string>(attachments.length === 0 ? 'Receipt' : 'Invoice')

  function upload(file: File) {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('kind', kind)
      fd.set('expenseId', expenseId)
      fd.set('label', label)
      fd.set('file', file)
      const res = await uploadExpenseAttachment(fd)
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

  function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return
    setError(null)
    startTransition(async () => {
      const res = await removeExpenseAttachment(id)
      if (res.error) { setError(res.error); return }
      router.refresh()
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
      {attachments.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 whitespace-nowrap">
          <button type="button" onClick={() => view(a.id)} disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:opacity-50 py-2 -my-2">
            <Paperclip className="w-3 h-3" /> {a.label ?? 'Attachment'}
          </button>
          <button type="button" onClick={() => remove(a.id, a.label ?? 'this attachment')} disabled={pending} aria-label={`Remove ${a.label ?? 'attachment'}`}
            className="text-gray-300 hover:text-red-500 disabled:opacity-50 p-2 -m-2">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-xs text-gray-500 bg-transparent border-0 p-0 pr-4 focus:ring-0 cursor-pointer"
          aria-label="Attachment type"
        >
          {ATTACHMENT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50 py-2 -my-2"
          title="Attach a file (JPEG, PNG, WebP, or PDF)">
          <Plus className="w-3 h-3" /> {pending ? 'Uploading…' : 'Attach'}
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
