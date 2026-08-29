'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, X } from 'lucide-react'
import { uploadExpenseReceipt, getReceiptUrl, removeExpenseReceipt, type ReceiptKind } from '@/actions/finances'

/**
 * Attach / view / remove a receipt on an expense or overhead row. Receipts
 * live in a private bucket; View opens a short-lived signed URL.
 */
export function ReceiptControl({ kind, expenseId, hasReceipt }: {
  kind: ReceiptKind
  expenseId: string
  hasReceipt: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function upload(file: File) {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('kind', kind)
      fd.set('expenseId', expenseId)
      fd.set('file', file)
      const res = await uploadExpenseReceipt(fd)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function view() {
    setError(null)
    startTransition(async () => {
      const res = await getReceiptUrl(kind, expenseId)
      if (res.error || !res.url) { setError(res.error ?? 'Could not open receipt'); return }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  function remove() {
    if (!confirm('Remove this receipt?')) return
    setError(null)
    startTransition(async () => {
      const res = await removeExpenseReceipt(kind, expenseId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
      />
      {hasReceipt ? (
        <>
          <button type="button" onClick={view} disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:opacity-50">
            <Paperclip className="w-3 h-3" /> Receipt
          </button>
          <button type="button" onClick={remove} disabled={pending} aria-label="Remove receipt"
            className="text-gray-300 hover:text-red-500 disabled:opacity-50">
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
          title="Attach a receipt (JPEG, PNG, WebP, or PDF)">
          <Paperclip className="w-3 h-3" /> {pending ? 'Uploading…' : 'Attach'}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
