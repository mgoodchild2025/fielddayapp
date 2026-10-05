'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

export type RegistrationFilter = 'all' | 'pending' | 'unpaid' | 'nowaiver'

const CHIPS: { key: RegistrationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'unpaid', label: 'Payment pending' },
  { key: 'nowaiver', label: 'No waiver' },
]

/**
 * Search + status chips for an event's registrations. State lives in the URL
 * (the page filters server-side), so it survives a refresh after recording a
 * payment. Finding one player out of 150 used to mean scrolling every card.
 */
export function RegistrationsFilterBar({ q, filter, showWaiver, counts }: {
  q: string
  filter: RegistrationFilter
  showWaiver: boolean
  counts: Record<RegistrationFilter, number>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [text, setText] = useState(q)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function push(next: { q?: string; filter?: RegistrationFilter }) {
    const sp = new URLSearchParams(params.toString())
    const nq = next.q ?? text
    const nf = next.filter ?? filter
    if (nq.trim()) sp.set('q', nq.trim()); else sp.delete('q')
    if (nf !== 'all') sp.set('filter', nf); else sp.delete('filter')
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`, { scroll: false }))
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="mb-4 space-y-2" aria-busy={isPending || undefined}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(e) => {
            const v = e.target.value
            setText(v)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => push({ q: v }), 300)
          }}
          placeholder="Search name or email"
          aria-label="Search registrations"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full min-h-11 border rounded-lg pl-9 pr-10 text-base sm:text-sm bg-white"
        />
        {text && (
          <button
            type="button"
            onClick={() => { setText(''); push({ q: '' }) }}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center text-gray-400 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {CHIPS.filter((c) => c.key !== 'nowaiver' || showWaiver).map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => push({ filter: c.key })}
            className={`press shrink-0 min-h-10 px-3.5 rounded-full text-sm font-medium border ${
              filter === c.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c.label} <span className={filter === c.key ? 'text-white/70' : 'text-gray-500'}>{counts[c.key]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
