'use client'

import { useState } from 'react'
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
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        View content
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-semibold text-gray-900">Version {version}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <LegalDocumentContent content={content} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
