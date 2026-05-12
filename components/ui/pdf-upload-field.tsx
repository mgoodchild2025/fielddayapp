'use client'

import { useRef, useState, useTransition } from 'react'

interface Props {
  label: string
  currentUrl: string | null
  onUpload: (formData: FormData) => Promise<{ url: string | null; error: string | null }>
  onRemove: () => Promise<{ error: string | null }>
}

function DocIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  )
}

export function PdfUploadField({ label, currentUrl, onUpload, onRemove }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.append('pdf', file)
    startTransition(async () => {
      const result = await onUpload(fd)
      if (result.error) {
        setError(result.error)
      } else {
        setUrl(result.url)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await onRemove()
      if (result.error) {
        setError(result.error)
      } else {
        setUrl(null)
      }
    })
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            <DocIcon />
            View {label} PDF
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <DocIcon />
            No PDF uploaded
          </span>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleChange}
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          className="text-xs px-2.5 py-1 border rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {pending ? 'Uploading…' : url ? 'Replace PDF' : 'Upload PDF'}
        </button>

        {url && !pending && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">PDF only · Max 10 MB</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
