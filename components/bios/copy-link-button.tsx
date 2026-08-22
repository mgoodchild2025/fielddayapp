'use client'

import { useState } from 'react'

/** Copies the current page URL — the "share my card" affordance. */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }).catch(() => {})
      }}
      className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied ? '✓ Link copied' : '🔗 Copy link'}
    </button>
  )
}
