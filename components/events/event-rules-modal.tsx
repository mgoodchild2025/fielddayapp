'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  content: string
}

export function EventRulesModal({ content }: Props) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  // Close on backdrop click
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) return
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      setOpen(false)
    }
  }

  // Close on Escape (dialog already does this natively, but sync state)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    function onClose() { setOpen(false) }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 text-sm font-medium hover:underline"
        style={{ color: 'var(--brand-primary)' }}
      >
        View Event Rules →
      </button>

      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        className="w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl p-0 backdrop:bg-black/50"
      >
        <div className="flex flex-col h-full max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <h2 className="text-lg font-bold">Event Rules</h2>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto px-6 py-5 flex-1">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-7">{content}</pre>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t shrink-0">
            <button
              onClick={() => setOpen(false)}
              className="w-full py-2 rounded-md text-sm font-semibold border hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
