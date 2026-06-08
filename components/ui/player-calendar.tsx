'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarDot = {
  id: string
  date: string       // YYYY-MM-DD (in org timezone)
  color: string | null
  label: string
  href: string
}

export type CalendarBand = {
  id: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  color: string
  label: string
  href: string
}

interface Props {
  dots?: CalendarDot[]
  bands?: CalendarBand[]
  timezone: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD of today in the user's local browser timezone */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Format a Date object as YYYY-MM-DD (local time) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Add N months to the first day of a month */
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

/** Human-readable "June 2026" */
function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Build the full grid for a month view — starts on the Sunday on/before the
 * 1st and ends on the Saturday on/after the last day of the month.
 */
function buildMonthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last  = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  const start = new Date(first)
  start.setDate(start.getDate() - start.getDay())  // back to previous Sunday

  const end = new Date(last)
  end.setDate(end.getDate() + (6 - end.getDay()))  // forward to next Saturday

  const grid: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    grid.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return grid
}

function bandCoversDate(band: CalendarBand, date: string): boolean {
  return band.startDate <= date && date <= band.endDate
}

// ── Component ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function PlayerCalendar({ dots = [], bands = [], timezone }: Props) {
  // Initialise to the month that contains the earliest upcoming dot/band, or today
  const firstUpcoming = (() => {
    const today = todayStr()
    const upcoming = [
      ...dots.filter(d => d.date >= today).map(d => d.date),
      ...bands.filter(b => b.endDate >= today).map(b => b.startDate > today ? b.startDate : today),
    ].sort()
    if (upcoming.length > 0) {
      const [y, m] = upcoming[0].split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })()

  const [currentMonth, setCurrentMonth] = useState<Date>(firstUpcoming)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = todayStr()
  const grid = buildMonthGrid(currentMonth)
  const currentMonthNum = currentMonth.getMonth()

  // Index dots and bands by date for O(1) lookup
  const dotsByDate = new Map<string, CalendarDot[]>()
  for (const dot of dots) {
    if (!dotsByDate.has(dot.date)) dotsByDate.set(dot.date, [])
    dotsByDate.get(dot.date)!.push(dot)
  }

  function getBandsForDate(date: string): CalendarBand[] {
    return bands.filter(b => bandCoversDate(b, date))
  }

  function handleDayClick(date: string) {
    const dayDots = dotsByDate.get(date) ?? []
    const dayBands = getBandsForDate(date)
    if (dayDots.length === 0 && dayBands.length === 0) {
      setSelectedDate(prev => prev === date ? null : date) // still toggle for UX feedback
      return
    }
    setSelectedDate(prev => prev === date ? null : date)
  }

  // Items to show in the selected-date panel
  const selectedDots  = selectedDate ? (dotsByDate.get(selectedDate) ?? []) : []
  const selectedBands = selectedDate ? getBandsForDate(selectedDate) : []
  const selectedItems = [
    ...selectedDots.map(d => ({ id: d.id, color: d.color, label: d.label, href: d.href })),
    ...selectedBands.map(b => ({ id: `band-${b.id}`, color: b.color, label: b.label, href: b.href })),
  ]

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">

      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button
          onClick={() => { setCurrentMonth(m => addMonths(m, -1)); setSelectedDate(null) }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">{formatMonthYear(currentMonth)}</span>
        <button
          onClick={() => { setCurrentMonth(m => addMonths(m, 1)); setSelectedDate(null) }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Day-of-week header ── */}
      <div className="grid grid-cols-7 border-b">
        {DOW_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* ── Day grid ── */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const dateStr = ymd(day)
          const inMonth = day.getMonth() === currentMonthNum
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate

          const dayDots  = dotsByDate.get(dateStr) ?? []
          const dayBands = getBandsForDate(dateStr)
          const hasItems = dayDots.length > 0 || dayBands.length > 0

          // Build colored indicator strips for this cell
          // Bands show as thin colored strips; dots show as circles
          const uniqueBandColors = [...new Set(dayBands.map(b => b.color))]
          const dotColors = dayDots.slice(0, 3).map(d => d.color ?? '#9ca3af')
          const extraDots = dayDots.length > 3 ? dayDots.length - 3 : 0

          return (
            <button
              key={i}
              onClick={() => handleDayClick(dateStr)}
              className={`
                relative flex flex-col items-center pt-2 pb-1.5 min-h-[52px] text-xs transition-colors border-b border-r
                ${i % 7 === 6 ? 'border-r-0' : ''}
                ${Math.floor(i / 7) === Math.floor((grid.length - 1) / 7) ? 'border-b-0' : ''}
                ${!inMonth ? 'opacity-30' : ''}
                ${isSelected ? 'bg-gray-50' : hasItems ? 'hover:bg-gray-50' : 'hover:bg-gray-50/50'}
              `}
            >
              {/* Date number */}
              <span
                className={`
                  w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium leading-none mb-1
                  ${isToday ? 'text-white font-bold' : isSelected ? 'text-gray-900 font-semibold' : 'text-gray-700'}
                `}
                style={isToday ? { backgroundColor: 'var(--brand-primary)' } : undefined}
              >
                {day.getDate()}
              </span>

              {/* Band strips */}
              {uniqueBandColors.length > 0 && (
                <div className="flex gap-0.5 w-full px-1 mb-0.5">
                  {uniqueBandColors.slice(0, 3).map((color, j) => (
                    <div key={j} className="h-1 flex-1 rounded-full opacity-70" style={{ backgroundColor: color }} />
                  ))}
                </div>
              )}

              {/* Dot indicators */}
              {dotColors.length > 0 && (
                <div className="flex items-center gap-0.5 justify-center">
                  {dotColors.map((color, j) => (
                    <span key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                  {extraDots > 0 && (
                    <span className="text-[9px] text-gray-400 leading-none">+{extraDots}</span>
                  )}
                </div>
              )}

              {/* Selected ring */}
              {isSelected && (
                <span
                  className="absolute inset-0 rounded-none pointer-events-none ring-2 ring-inset"
                  style={{ '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Selected date panel ── */}
      {selectedDate && (
        <div className="border-t px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">No events on this day.</p>
          ) : (
            <div className="space-y-1.5">
              {selectedItems.map(item => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-2.5 py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color ?? '#9ca3af' }}
                  />
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate group-hover:text-gray-900 transition-colors">
                    {item.label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Convert an ISO timestamp to a YYYY-MM-DD string in a given IANA timezone.
 * Safe to use in both client and server contexts.
 */
export function toLocalDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso))
}
