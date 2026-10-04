'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapse } from '@/components/ui/collapse'

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
        aria-expanded={open}
        className="press flex items-center gap-1.5 min-h-10 text-sm font-medium text-gray-600 hover:text-gray-800 mb-2"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {open ? `Hide past ${label}` : `Show past ${label} (${count})`}
      </button>
      <Collapse open={open} className="space-y-2">{children}</Collapse>
    </div>
  )
}
