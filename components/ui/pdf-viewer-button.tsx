'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  url: string
  label?: string
  /** Render as a small icon button (for document lists) vs a full pill button */
  variant?: 'pill' | 'icon'
  className?: string
}

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

  // Close on backdrop click
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

  return (
    <>
      {variant === 'pill' ? (
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
          {/* File icon */}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </button>
      )}

      {/* Native <dialog> — handles focus trap, Esc key, and backdrop automatically */}
      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        onClose={() => setOpen(false)}
        className="w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl p-0 backdrop:bg-black/50 border-0"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-xl shrink-0">
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

          {/* PDF frame */}
          <iframe
            src={url}
            className="flex-1 w-full border-0 rounded-b-xl"
            title={label}
          />
        </div>
      </dialog>
    </>
  )
}
