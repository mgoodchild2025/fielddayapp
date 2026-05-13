'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  url: string
  label?: string
  /**
   * pill  — full-width pill button (Format/Rules tabs)
   * icon  — small icon-only button (admin document list hover actions)
   * row   — full-width list row with PDF icon + title + chevron (Overview documents list)
   */
  variant?: 'pill' | 'icon' | 'row'
  className?: string
}

// Height of the modal header bar in px — used to calculate iframe height.
const HEADER_H = 57

export function PdfViewerButton({ url, label = 'View PDF', variant = 'pill', className }: Props) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      el.showModal()
    } else {
      el.close()
    }
  }, [open])

  // Close on backdrop click (click outside the dialog box)
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) return
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setOpen(false)
    }
  }

  // Google Docs Viewer renders the PDF inline regardless of how the origin
  // server sets Content-Disposition — no "download" prompt, works cross-browser.
  const viewerSrc = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`

  return (
    <>
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

      {/*
        Native <dialog> gives us focus-trap, Esc-to-close, and backdrop for free.
        Explicit pixel heights are used instead of Tailwind flex so the iframe
        gets a concrete height — <dialog> doesn't always pass 'h-[90vh]' down to
        children reliably enough for flex-1 to work.
      */}
      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        onClose={() => setOpen(false)}
        className="w-full max-w-4xl rounded-xl shadow-2xl p-0 backdrop:bg-black/50 border-0 overflow-hidden"
        style={{ height: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 border-b bg-gray-50 rounded-t-xl"
          style={{ height: `${HEADER_H}px` }}
        >
          <span className="text-sm font-medium text-gray-700 truncate pr-4">{label}</span>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              title="Open in new tab"
            >
              Open in tab ↗
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* PDF — rendered via Google Docs Viewer so it always displays inline */}
        <iframe
          src={open ? viewerSrc : undefined}
          title={label}
          className="block w-full border-0 rounded-b-xl bg-gray-100"
          style={{ height: `calc(90vh - ${HEADER_H}px)` }}
        />
      </dialog>
    </>
  )
}
