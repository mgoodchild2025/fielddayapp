'use client'

import { useState, useId } from 'react'
import { RichTextContent } from '@/components/ui/rich-text-content'
import { Overlay } from '@/components/ui/overlay'

interface Props {
  content: string
  title?: string
  buttonLabel?: string
}

export function EventRulesModal({ content, title = 'Event Rules', buttonLabel = 'View Event Rules →' }: Props) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 text-sm font-medium hover:underline"
        style={{ color: 'var(--brand-primary)' }}
      >
        {buttonLabel}
      </button>

      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        labelledBy={titleId}
        panelClassName="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col max-h-[85dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button
            onClick={() => setOpen(false)}
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <RichTextContent content={content} className="text-gray-700" />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="w-full py-2.5 rounded-md text-sm font-semibold border hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </Overlay>
    </>
  )
}
