'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Collapse } from '@/components/ui/collapse'

export interface StandingsDetail {
  label: string
  value: ReactNode
}

/**
 * One standings row. On phones the table shows only the columns that decide
 * the order; tapping the row (or its chevron) opens the rest of the team's
 * line underneath — no sideways scrolling. From `sm` up every column is in
 * the table, so the chevron and detail row are hidden.
 *
 * Cells stay server-rendered (children); this only owns the open state.
 * Striping is by index (`striped`) because the detail rows would throw off
 * `odd:`/`even:`.
 */
export function StandingsRow({
  children,
  details,
  teamHref,
  teamName,
  striped,
}: {
  children: ReactNode
  details: StandingsDetail[]
  teamHref: string
  /** Shown in full in the panel — the row truncates it on phones. */
  teamName: string
  striped: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const bg = striped ? 'bg-gray-50' : 'bg-white'

  return (
    <>
      <tr
        className={`border-b last:border-0 ${bg} hover:bg-gray-100 transition-colors max-sm:cursor-pointer`}
        onClick={(e) => {
          // Links in the row (the team name) keep navigating.
          if ((e.target as Element).closest('a')) return
          if (window.matchMedia('(max-width: 639px)').matches) setOpen((o) => !o)
        }}
      >
        {children}
        <td className="sm:hidden w-7 pr-1 py-2 text-right">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Hide team stats' : 'Show team stats'}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
            className="press inline-flex items-center justify-center w-7 h-9 -my-1 rounded-full text-gray-400"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ease-snap ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </td>
      </tr>
      <tr className={`sm:hidden ${bg}`} aria-hidden={!open || undefined}>
        <td colSpan={20} className="p-0">
          <Collapse open={open}>
            <div id={panelId} className="px-3 pb-3 pt-1 border-b">
              <p className="text-sm font-semibold text-gray-900 mb-2">{teamName}</p>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                {details.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-[11px] font-medium text-gray-500">{d.label}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-gray-800">{d.value}</dd>
                  </div>
                ))}
              </dl>
              <Link href={teamHref} className="mt-2 inline-flex items-center min-h-9 text-xs font-semibold text-brand-primary">
                Team stats →
              </Link>
            </div>
          </Collapse>
        </td>
      </tr>
    </>
  )
}
