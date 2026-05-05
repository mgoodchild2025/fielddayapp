'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  count: number
  label?: string   // e.g. "teams" or "events" — defaults to "games"
  children: React.ReactNode
}

export function PastGamesToggle({ count, label = 'games', children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors mb-3"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {open ? `Hide past ${label}` : `Show past ${label} (${count})`}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  )
}
