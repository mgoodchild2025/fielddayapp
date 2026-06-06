'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string
  type: 'game' | 'session'
  scheduled_at: string
  localDate: string           // YYYY-MM-DD in org timezone
  court: string | null
  status: string
  home_team: { name: string } | null
  away_team: { name: string } | null
  capacity?: number | null
  location_override?: string | null
  league: { id: string; name: string; slug: string }
}

// ── Colour palette (one per league, cycles) ───────────────────────────────────

const PALETTE = [
  { chip: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-400'   },
  { chip: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-400' },
  { chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  { chip: 'bg-rose-100 text-rose-700 border-rose-200',   dot: 'bg-rose-400'   },
  { chip: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400'  },
  { chip: 'bg-cyan-100 text-cyan-700 border-cyan-200',   dot: 'bg-cyan-400'   },
  { chip: 'bg-pink-100 text-pink-700 border-pink-200',   dot: 'bg-pink-400'   },
  { chip: 'bg-teal-100 text-teal-700 border-teal-200',   dot: 'bg-teal-400'   },
]
// Sessions always get a distinct dashed style
const SESSION_CHIP = 'bg-orange-50 text-orange-700 border-orange-200 italic'
const SESSION_DOT  = 'bg-orange-400'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All date cells to render in a month grid, including overflow from adj. months. */
function buildGrid(year: number, month: number): { dateStr: string; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const lastOfMonth  = new Date(year, month, 0)

  // Step back to the previous Sunday
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(1 - firstOfMonth.getDay())

  // Step forward to the next Saturday
  const gridEnd = new Date(lastOfMonth)
  gridEnd.setDate(lastOfMonth.getDate() + ((6 - lastOfMonth.getDay() + 7) % 7))

  const cells: { dateStr: string; inMonth: boolean }[] = []
  const cursor = new Date(gridStart)

  while (cursor <= gridEnd) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    cells.push({
      dateStr: `${y}-${m}-${d}`,
      inMonth: cursor.getMonth() === month - 1 && cursor.getFullYear() === year,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return cells
}

/** YYYY-MM-DD → { weekday, month day } label, UTC-safe. */
function labelDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(Date.UTC(y, m - 1, d))
}

/** Day-of-month number from YYYY-MM-DD, UTC-safe. */
function dayNum(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10)
}

/** Compact chip label for a calendar cell. */
function chipLabel(ev: CalendarEvent, timezone: string): string {
  const t = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  }).format(new Date(ev.scheduled_at)).replace(':00', '').replace(' ', '')

  if (ev.type === 'session') return `${t} · Pickup`
  const h = ev.home_team?.name.split(' ').pop() ?? '?'
  const a = ev.away_team?.name.split(' ').pop() ?? '?'
  return `${t} · ${h} v ${a}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  events: CalendarEvent[]
  year: number
  month: number
  timezone: string
  currentYM: string
  initialDay: string | null
}

export function AdminCalendar({ events, year, month, timezone, currentYM, initialDay }: Props) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDay)

  // Assign a colour index to each unique league (stable per render)
  const leaguePalette = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const e of events) {
      if (!map.has(e.league.id)) map.set(e.league.id, idx++)
    }
    return map
  }, [events])

  const palette = (leagueId: string) => PALETTE[(leaguePalette.get(leagueId) ?? 0) % PALETTE.length]

  // Group events by localDate
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!map.has(e.localDate)) map.set(e.localDate, [])
      map.get(e.localDate)!.push(e)
    }
    return map
  }, [events])

  const gridCells = useMemo(() => buildGrid(year, month), [year, month])

  const selectedEvents = selectedDate ? (byDate.get(selectedDate) ?? []) : []

  // Month navigation → server re-fetch via searchParam
  function navigate(delta: number) {
    let y = year, m = month + delta
    if (m > 12) { y++; m = 1 }
    if (m < 1)  { y--; m = 12 }
    const ym = `${y}-${String(m).padStart(2, '0')}`
    setSelectedDate(null)
    router.push(`/admin/calendar?month=${ym}`)
  }

  const thisYM = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())

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
            <h2 className="font-semibold text-gray-900 text-sm sm:text-base">{monthLabel}</h2>
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

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {gridCells.map(({ dateStr, inMonth }, i) => {
            const dayEvents = byDate.get(dateStr) ?? []
            const isToday    = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const chips      = dayEvents.slice(0, 2)
            const overflow   = dayEvents.length - chips.length

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={[
                  'relative min-h-[72px] sm:min-h-[96px] p-1 sm:p-2 text-left border-b border-r transition-colors',
                  // last column: no right border
                  (i + 1) % 7 === 0 ? 'border-r-0' : '',
                  isSelected
                    ? 'bg-[var(--brand-primary)]/5 ring-2 ring-inset ring-[var(--brand-primary)]'
                    : 'hover:bg-gray-50',
                  !inMonth ? 'opacity-30' : '',
                ].join(' ')}
              >
                {/* Day number */}
                <span className={[
                  'inline-flex items-center justify-center w-6 h-6 text-xs sm:text-sm font-medium rounded-full mb-1',
                  isToday
                    ? 'text-white'
                    : isSelected
                      ? 'text-[var(--brand-primary)] font-bold'
                      : 'text-gray-700',
                ].join(' ')}
                  style={isToday ? { backgroundColor: 'var(--brand-primary)' } : {}}
                >
                  {dayNum(dateStr)}
                </span>

                {/* Event chips — max 2 on the grid */}
                <div className="space-y-0.5">
                  {chips.map((ev) => (
                    <div
                      key={ev.id}
                      className={[
                        'text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 rounded border truncate',
                        ev.type === 'session' ? SESSION_CHIP : palette(ev.league.id).chip,
                      ].join(' ')}
                    >
                      {chipLabel(ev, timezone)}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[9px] sm:text-[10px] text-gray-400 px-1 font-medium">
                      +{overflow} more
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Legend */}
        {leaguePalette.size > 0 && (
          <div className="px-4 py-3 border-t flex flex-wrap gap-x-4 gap-y-1.5">
            {[...leaguePalette.entries()].map(([id, idx]) => {
              const ev = events.find((e) => e.league.id === id)
              if (!ev) return null
              const p = PALETTE[idx % PALETTE.length]
              return (
                <span key={id} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.dot}`} />
                  {ev.league.name}
                </span>
              )
            })}
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SESSION_DOT}`} />
              Pickup sessions
            </span>
          </div>
        )}
      </div>

      {/* ── Day panel ────────────────────────────────────────────────────── */}
      {selectedDate && (
        <div className="w-full lg:w-80 xl:w-96 shrink-0 bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b">
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-snug">{labelDate(selectedDate)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedEvents.length === 0
                  ? 'No events scheduled'
                  : `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}`}
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

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-8 text-center">
              No games or sessions on this day.
            </p>
          ) : (
            <div className="divide-y overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-220px)]">
              {selectedEvents.map((ev) => {
                const timeStr = new Intl.DateTimeFormat('en-CA', {
                  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
                }).format(new Date(ev.scheduled_at))

                const p = ev.type === 'session'
                  ? { dot: SESSION_DOT }
                  : palette(ev.league.id)

                return (
                  <Link
                    key={ev.id}
                    href={`/admin/events/${ev.league.id}/schedule`}
                    className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Coloured left border */}
                    <span className={`shrink-0 w-1 self-stretch rounded-full mt-0.5 ${p.dot}`} />

                    <div className="flex-1 min-w-0">
                      {/* Time + court + status */}
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold tabular-nums text-gray-800">{timeStr}</span>
                        {ev.court && (
                          <span className="text-xs text-gray-400">{ev.court}</span>
                        )}
                        {ev.location_override && (
                          <span className="text-xs text-gray-400">{ev.location_override}</span>
                        )}
                        {ev.status === 'postponed' && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">
                            Postponed
                          </span>
                        )}
                      </div>

                      {/* Match-up or session label */}
                      {ev.type === 'game' ? (
                        <p className="text-sm font-medium text-gray-900 truncate mt-0.5">
                          {ev.home_team?.name ?? 'TBD'}
                          <span className="text-gray-400 font-normal mx-1">vs</span>
                          {ev.away_team?.name ?? 'TBD'}
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                          Pickup Session
                          {ev.capacity != null && (
                            <span className="text-gray-400 font-normal"> · {ev.capacity} spots</span>
                          )}
                        </p>
                      )}

                      {/* League name + arrow */}
                      <p className="text-xs text-gray-400 truncate mt-0.5 group-hover:text-gray-600 transition-colors">
                        {ev.league.name} →
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
