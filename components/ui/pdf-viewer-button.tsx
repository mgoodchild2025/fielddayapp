'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  url: string
  label?: string
  /**
   * pill  — full-width pill button (Format/Rules tabs)
   * icon  — small icon-only button (admin document list)
   * row   — full-width list row with PDF icon + title + chevron (Overview documents list)
   */
  variant?: 'pill' | 'icon' | 'row'
  className?: string
}

export function PdfViewerButton({ url, label = 'View PDF', variant = 'pill', className }: Props) {
  const [open, setOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const blobRef = useRef<string | null>(null)

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Fetch PDF as blob when modal opens — bypasses X-Frame-Options/CSP restrictions
  // that Supabase Storage sets on direct URLs.
  useEffect(() => {
    if (!open || blobUrl) return
    setLoading(true)
    setFetchError(false)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        blobRef.current = objectUrl
        setBlobUrl(objectUrl)
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }, [open, url, blobUrl])

  // Revoke blob URL on unmount to free memory
  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    }
  }, [])


  return (
    <>
      {/* ── Trigger button ── */}
      {variant === 'row' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 w-full text-left hover:text-blue-700 transition-colors group"
        >
          <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="flex-1 text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors">{label}</span>
          <svg className="w-3.5 h-3.5 shrink-0 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : variant === 'pill' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ??
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors'
          }
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className ?? 'p-1 text-gray-400 hover:text-blue-600 transition-colors'}
          title={label}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </button>
      )}

      {/* ── Modal overlay — only mounted when open ── */}
      {open && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <div
            className="relative w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden bg-white flex flex-col"
            style={{ height: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
              <span className="text-sm font-medium text-gray-700 truncate pr-4">{label}</span>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Open in tab ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* PDF viewer — uses blob URL to bypass X-Frame-Options on storage */}
            {loading && (
              <div className="flex-1 flex items-center justify-center bg-gray-100 text-sm text-gray-400">
                Loading…
              </div>
            )}
            {fetchError && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-100 text-sm text-gray-500">
                <p>Could not load the PDF inline.</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Open PDF in new tab ↗
                </a>
              </div>
            )}
            {blobUrl && !loading && !fetchError && (
              <iframe
                src={blobUrl}
                title={label}
                className="flex-1 w-full border-0 bg-gray-100"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
