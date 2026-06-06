'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarLeague = {
  id: string
  name: string
  slug: string
  status: string
  eventType: string
  startDate: string | null  // YYYY-MM-DD
  endDate: string | null    // YYYY-MM-DD
}

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = [
  { chip: 'bg-blue-500 text-white',        pill: 'bg-blue-100 text-blue-800 border-blue-200',   dot: 'bg-blue-500'   },
  { chip: 'bg-violet-500 text-white',      pill: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  { chip: 'bg-emerald-500 text-white',     pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  { chip: 'bg-rose-500 text-white',        pill: 'bg-rose-100 text-rose-800 border-rose-200',   dot: 'bg-rose-500'   },
  { chip: 'bg-amber-500 text-white',       pill: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500'  },
  { chip: 'bg-cyan-500 text-white',        pill: 'bg-cyan-100 text-cyan-800 border-cyan-200',   dot: 'bg-cyan-500'   },
  { chip: 'bg-pink-500 text-white',        pill: 'bg-pink-100 text-pink-800 border-pink-200',   dot: 'bg-pink-500'   },
  { chip: 'bg-teal-500 text-white',        pill: 'bg-teal-100 text-teal-800 border-teal-200',   dot: 'bg-teal-500'   },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD → integer days since epoch (UTC-safe) */
function toDays(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Integer days since epoch → YYYY-MM-DD */
function fromDays(days: number): string {
  const d = new Date(days * 86_400_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Day-of-month number from YYYY-MM-DD (no timezone ambiguity) */
function dayNum(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10)
}

/** Human-readable date label for the day panel header */
function labelDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(Date.UTC(y, m - 1, d))
}

/** Short date like "Jun 2" */
function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(Date.UTC(y, m - 1, d))
}

/**
 * Build the full month grid as week rows, each an array of 7 cells.
 * Cells include overflow days from adjacent months.
 */
function buildWeekRows(year: number, month: number): { dateStr: string; inMonth: boolean }[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const lastOfMonthDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const startDow = firstOfMonth.getUTCDay()          // 0 = Sun

  const gridStartDays = toDays(`${year}-${String(month).padStart(2, '0')}-01`) - startDow
  const totalCells = Math.ceil((startDow + lastOfMonthDate) / 7) * 7

  const rows: { dateStr: string; inMonth: boolean }[][] = []
  for (let row = 0; row < totalCells / 7; row++) {
    const cells = []
    for (let col = 0; col < 7; col++) {
      const dayIndex = row * 7 + col
      const dateStr = fromDays(gridStartDays + dayIndex)
      const inMonth = dayIndex >= startDow && dayIndex < startDow + lastOfMonthDate
      cells.push({ dateStr, inMonth })
    }
    rows.push(cells)
  }
  return rows
}

/**
 * For a given week row, return the list of leagues that overlap with it,
 * along with their CSS grid column positioning.
 */
function getWeekBands(
  row: { dateStr: string }[],
  leagues: CalendarLeague[],
): { league: CalendarLeague; startCol: number; span: number; isStart: boolean; isEnd: boolean }[] {
  const weekStartDays = toDays(row[0].dateStr)
  const weekEndDays   = toDays(row[6].dateStr)

  return leagues
    .filter((l) => l.startDate && l.endDate)
    .filter((l) => {
      const s = toDays(l.startDate!)
      const e = toDays(l.endDate!)
      return s <= weekEndDays && e >= weekStartDays
    })
    .map((l) => {
      const s = toDays(l.startDate!)
      const e = toDays(l.endDate!)
      const startCol = Math.max(1, s - weekStartDays + 1)   // 1-indexed
      const endCol   = Math.min(7, e - weekStartDays + 1)
      return {
        league: l,
        startCol,
        span: endCol - startCol + 1,
        isStart: s >= weekStartDays,  // league begins in this row
        isEnd:   e <= weekEndDays,    // league ends in this row
      }
    })
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:            'bg-blue-100 text-blue-700',
    registration_open: 'bg-green-100 text-green-700',
    completed:         'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    active: 'In Season', registration_open: 'Open', completed: 'Completed',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  leagues: CalendarLeague[]
  year: number
  month: number
  timezone: string
  currentYM: string
  initialDay: string | null
}

export function AdminCalendar({ leagues, year, month, timezone, currentYM, initialDay }: Props) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDay)

  // Assign a stable colour index per league
  const leaguePalette = useMemo(() => {
    const map = new Map<string, number>()
    leagues.forEach((l, i) => map.set(l.id, i))
    return map
  }, [leagues])

  const palette = (leagueId: string) => PALETTE[(leaguePalette.get(leagueId) ?? 0) % PALETTE.length]

  const weekRows = useMemo(() => buildWeekRows(year, month), [year, month])

  // Leagues that have no start/end date set (warn about them)
  const undatedLeagues = leagues.filter((l) => !l.startDate || !l.endDate)

  // Leagues active on the selected date
  const selectedLeagues = useMemo(() => {
    if (!selectedDate) return []
    const sd = toDays(selectedDate)
    return leagues.filter(
      (l) => l.startDate && l.endDate && toDays(l.startDate) <= sd && toDays(l.endDate) >= sd
    )
  }, [selectedDate, leagues])

  // Month navigation → server re-fetch via searchParam
  function navigate(delta: number) {
    let y = year, m = month + delta
    if (m > 12) { y++; m = 1 }
    if (m < 1)  { y--; m = 12 }
    const ym = `${y}-${String(m).padStart(2, '0')}`
    setSelectedDate(null)
    router.push(`/admin/calendar?month=${ym}`)
  }

  const thisYM     = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  const todayStr   = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">

      {/* ── Month grid ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-white rounded-xl border shadow-sm overflow-hidden">

        {/* Nav header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">{monthLabel}</h2>
            {thisYM !== currentYM && (
              <button
                onClick={() => { router.push('/admin/calendar'); setSelectedDate(null) }}
                className="text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-0.5 transition-colors"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.charAt(0)}</span>
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weekRows.map((row, rowIdx) => {
          const bands = getWeekBands(row, leagues)
          const isLastRow = rowIdx === weekRows.length - 1

          return (
            <div key={row[0].dateStr} className={isLastRow ? '' : 'border-b'}>

              {/* League bands — span multiple columns using CSS grid */}
              {bands.length > 0 && (
                <div className="grid grid-cols-7 gap-x-0.5 px-0.5 pt-1 pb-0.5">
                  {bands.map(({ league, startCol, span, isStart, isEnd }) => {
                    const p = palette(league.id)
                    return (
                      <Link
                        key={league.id}
                        href={`/admin/events/${league.id}/schedule`}
                        style={{ gridColumn: `${startCol} / span ${span}` }}
                        className={[
                          'block text-[10px] sm:text-xs leading-none py-1 px-1.5 rounded-sm mb-0.5 truncate font-medium transition-opacity hover:opacity-80',
                          p.chip,
                          !isStart ? 'rounded-l-none pl-1' : '',
                          !isEnd   ? 'rounded-r-none pr-1' : '',
                        ].join(' ')}
                        title={league.name}
                      >
                        {/* Show name only when the league starts in this row or at the first column */}
                        {(isStart || startCol === 1) ? league.name : ''}
                      </Link>
                    )
                  })}
                </div>
              )}

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {row.map(({ dateStr, inMonth }, colIdx) => {
                  const isToday    = dateStr === todayStr
                  const isSelected = dateStr === selectedDate
                  const isLastCol  = colIdx === 6

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={[
                        'h-8 sm:h-10 flex items-start justify-end p-1 transition-colors',
                        isLastCol ? '' : 'border-r',
                        isSelected ? 'bg-gray-50 ring-1 ring-inset ring-[var(--brand-primary)]' : 'hover:bg-gray-50',
                        !inMonth ? 'opacity-25' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'inline-flex items-center justify-center w-6 h-6 text-xs sm:text-sm font-medium rounded-full',
                          isToday
                            ? 'text-white'
                            : isSelected
                              ? 'font-bold'
                              : 'text-gray-600',
                        ].join(' ')}
                        style={isToday ? { backgroundColor: 'var(--brand-primary)', color: 'white' } : {}}
                      >
                        {dayNum(dateStr)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Legend */}
        {leagues.filter((l) => l.startDate && l.endDate).length > 0 && (
          <div className="px-4 py-3 border-t flex flex-wrap gap-x-5 gap-y-1.5">
            {leagues.filter((l) => l.startDate && l.endDate).map((l) => (
              <Link
                key={l.id}
                href={`/admin/events/${l.id}`}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors"
              >
                <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${palette(l.id).chip}`} />
                {l.name}
              </Link>
            ))}
          </div>
        )}

        {/* Warning for leagues without dates */}
        {undatedLeagues.length > 0 && (
          <div className="px-4 py-3 border-t bg-amber-50 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">
                {undatedLeagues.length} event{undatedLeagues.length !== 1 ? 's' : ''} without season dates set:
              </p>
              <div className="flex flex-wrap gap-x-3 mt-1">
                {undatedLeagues.map((l) => (
                  <Link
                    key={l.id}
                    href={`/admin/events/${l.id}`}
                    className="text-xs text-amber-700 hover:underline"
                  >
                    {l.name} →
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Day panel ────────────────────────────────────────────────────── */}
      {selectedDate && (
        <div className="w-full lg:w-80 xl:w-96 shrink-0 bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b">
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-snug">{labelDate(selectedDate)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedLeagues.length === 0
                  ? 'No events on this day'
                  : `${selectedLeagues.length} event${selectedLeagues.length !== 1 ? 's' : ''} in season`}
              </p>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              className="p-1 rounded hover:bg-gray-100 transition-colors shrink-0 mt-0.5"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {selectedLeagues.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-8 text-center">
              No events are scheduled on this day.
            </p>
          ) : (
            <div className="divide-y">
              {selectedLeagues.map((l) => {
                const p = palette(l.id)
                const dateRange = l.startDate && l.endDate
                  ? `${shortDate(l.startDate)} – ${shortDate(l.endDate)}`
                  : null
                return (
                  <Link
                    key={l.id}
                    href={`/admin/events/${l.id}/schedule`}
                    className="flex items-start gap-3 px-4 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Colour dot */}
                    <span className={`shrink-0 w-2.5 h-2.5 rounded-sm mt-1 ${p.chip}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">{l.name}</span>
                        <StatusBadge status={l.status} />
                      </div>
                      {dateRange && (
                        <p className="text-xs text-gray-400 mt-0.5">{dateRange}</p>
                      )}
                      <p className="text-xs font-medium mt-1.5 group-hover:underline" style={{ color: 'var(--brand-primary)' }}>
                        View schedule →
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
