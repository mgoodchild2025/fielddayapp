'use client'

import { useState } from 'react'
import { Overlay } from '@/components/ui/overlay'
import { LegalDocumentContent } from './legal-document-content'

interface Props {
  version: string
  content: string
}

export function VersionContentViewer({ version, content }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press min-h-10 text-sm text-gray-400 hover:text-gray-200"
      >
        View content
      </button>

      {/* Shared Overlay: scroll lock, Escape, focus trap. */}
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={`legal-version-${version}`}
        panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
          <h2 id={`legal-version-${version}`} className="font-semibold text-gray-900">Version {version}</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="press -mr-2 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          <LegalDocumentContent content={content} />
        </div>
      </Overlay>
    </>
  )
}
