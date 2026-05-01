'use client'

import { useState } from 'react'

interface Props {
  /** Number of hidden items — if 0 the component renders nothing */
  count: number
  /** e.g. "league" or "team" */
  noun: string
  children: React.ReactNode
}

export function CollapsiblePast({ count, noun, children }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (count === 0) return null

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded
          ? `Hide completed ${noun}${count !== 1 ? 's' : ''}`
          : `Show ${count} completed ${noun}${count !== 1 ? 's' : ''}`}
      </button>

      {expanded && (
        <div className="mt-1 border-t pt-1 opacity-70">
          {children}
        </div>
      )}
    </div>
  )
}
