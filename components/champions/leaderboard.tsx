'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, ChevronDown } from 'lucide-react'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { Collapse } from '@/components/ui/collapse'

/**
 * A Hall of Champions honour roll as a ranked list: rank (ties share one,
 * "T-3"), avatar, name → card, and the number that earns the place. The top
 * five show; "Show all" opens the rest in place. The signed-in player's own
 * row is highlighted, and pinned under the top five when it's further down —
 * finding yourself is why most people open this page.
 */

export interface LeaderboardRow {
  key: string
  rank: string
  userId: string | null
  name: string
  avatarUrl: string | null
  isViewer: boolean
  /** kind="medals" */
  gold?: number
  silver?: number
  bronze?: number
  titles?: number
  /** kind="seasons" */
  seasons?: number
}

const TOP = 5

export function Leaderboard({ title, sub, kind, rows, noun, capped, viewerRow }: {
  title: string
  sub: string
  kind: 'medals' | 'seasons'
  rows: LeaderboardRow[]
  /** "medallists" / "players" — for "Show all 38 medallists". */
  noun: string
  /** Total when `rows` was cut to a maximum ("Top 100 of 240 shown"). */
  capped?: number
  /** The signed-in player's row when it fell past the cut — still pinned. */
  viewerRow?: LeaderboardRow | null
}) {
  const [open, setOpen] = useState(false)
  const top = rows.slice(0, TOP)
  const rest = rows.slice(TOP)
  const viewerIndex = rows.findIndex((r) => r.isViewer)
  const pinned = viewerIndex >= TOP ? (open ? null : rows[viewerIndex]) : viewerIndex === -1 ? viewerRow ?? null : null
  const showTitles = kind === 'medals' && rows.some((r) => (r.titles ?? 0) > 0)
  const maxSeasons = Math.max(1, ...rows.map((r) => r.seasons ?? 0))

  const row = (r: LeaderboardRow, pinnedRow = false) => (
    <li
      key={pinnedRow ? `pinned-${r.key}` : r.key}
      className={`flex items-center gap-2.5 py-2 text-sm ${
        r.isViewer ? '-mx-2 rounded-lg bg-brand-primary/10 px-2' : 'border-t border-gray-100 first:border-t-0'
      } ${pinnedRow ? 'mt-2' : ''}`}
    >
      <span className="w-8 shrink-0 whitespace-nowrap text-right font-mono text-xs text-gray-500 tabular-nums">{r.rank}</span>
      <PlayerAvatar avatarUrl={r.avatarUrl} name={r.name} size="sm" />
      <span className="min-w-0 flex-1 truncate">
        {r.isViewer && <span className="font-semibold text-brand-ink">You · </span>}
        {r.userId ? (
          <Link href={`/players/${r.userId}/card`} prefetch={false} className="font-semibold text-gray-800 hover:underline">{r.name}</Link>
        ) : (
          <span className="font-semibold text-gray-800">{r.name}</span>
        )}
      </span>
      {kind === 'medals' ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums text-gray-700">
          <span className="sr-only">
            {[`${r.gold ?? 0} gold`, `${r.silver ?? 0} silver`, `${r.bronze ?? 0} bronze`, showTitles ? `${r.titles ?? 0} division titles` : null].filter(Boolean).join(', ')}
          </span>
          <Count value={r.gold ?? 0} dot="bg-amber-400" />
          <Count value={r.silver ?? 0} dot="bg-gray-400" />
          <Count value={r.bronze ?? 0} dot="bg-orange-700" />
          {showTitles && (
            <span aria-hidden="true" className="inline-flex w-6 items-center gap-1">
              {r.titles ? <><Trophy className="h-3 w-3 text-gray-500" />{r.titles}</> : null}
            </span>
          )}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 min-[380px]:block sm:hidden lg:block">
            <span className="block h-full rounded-full bg-brand-primary/60" style={{ width: `${((r.seasons ?? 0) / maxSeasons) * 100}%` }} />
          </span>
          <span className="w-16 text-right text-xs font-medium tabular-nums text-gray-700">
            {r.seasons} season{r.seasons !== 1 ? 's' : ''}
          </span>
        </span>
      )}
    </li>
  )

  return (
    // min-w-0: a grid item must not grow past its column on a phone.
    <div className="min-w-0 rounded-xl border bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="text-[11px] text-gray-500">{sub}</p>
      {kind === 'medals' && (
        <p aria-hidden="true" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <Legend dot="bg-amber-400" label="Gold" />
          <Legend dot="bg-gray-400" label="Silver" />
          <Legend dot="bg-orange-700" label="Bronze" />
          {showTitles && <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" />Division title</span>}
        </p>
      )}

      <ol className="mt-2">
        {top.map((r) => row(r))}
      </ol>
      {rest.length > 0 && (
        <Collapse open={open}>
          <ol className="border-t border-gray-100">
            {rest.map((r) => row(r))}
          </ol>
          {capped && capped > rows.length && (
            <p className="pt-2 text-[11px] text-gray-500">Top {rows.length} of {capped} shown.</p>
          )}
        </Collapse>
      )}
      {pinned && <ol>{row(pinned, true)}</ol>}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="press mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-ink"
        >
          {open ? 'Show fewer' : capped && capped > rows.length ? `Show the top ${rows.length}` : `Show all ${rows.length} ${noun}`}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

/** One medal column; a zero leaves the slot empty so the columns still line up. */
function Count({ value, dot }: { value: number; dot: string }) {
  return (
    <span aria-hidden="true" className="inline-flex w-6 items-center gap-1">
      {value > 0 && <><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />{value}</>}
    </span>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${dot}`} />{label}
    </span>
  )
}
