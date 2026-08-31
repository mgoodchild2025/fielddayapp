'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { EventAvatar } from '@/components/ui/event-avatar'
import { EventCard } from '@/components/events/event-card'
import type { EventSpots } from '@/lib/event-spots'

export interface EventItem {
  id: string
  name: string
  slug: string
  status: string
  event_type: string | null
  sport: string | null
  logo_url: string | null
  price_cents: number
  drop_in_price_cents: number | null
  currency: string
  season_start_date: string | null
  max_teams: number | null
  spots?: EventSpots | null
  payment_mode: string | null
  skill_level: string | null
  days_of_week: string[] | null
  game_start_time: string | null
  game_end_time: string | null
  advertised?: boolean | null
  featured?: boolean | null
  registration_opens_at?: string | null
  teaser_text?: string | null
}

// ── Config ────────────────────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
  volleyball:       '🏐',
  beach_volleyball: '🏐',
  soccer:           '⚽',
  basketball:       '🏀',
  hockey:           '🏒',
  softball:         '🥎',
  baseball:         '⚾',
  flag_football:    '🏈',
  football:         '🏈',
  tennis:           '🎾',
  badminton:        '🏸',
  pickleball:       '🏓',
  ultimate:         '🥏',
  rugby:            '🏉',
  lacrosse:         '🥍',
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  league:     'League',
  tournament: 'Tournament',
  pickup:     'Pickup',
  drop_in:    'Drop-in',
  clinic:     'Clinic',
  camp:       'Camp',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSport(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`
}

function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`
  if (start) return formatTime(start)
  return formatTime(end!)
}

function formatYear(iso: string) {
  return new Date(iso).getUTCFullYear()
}

// ── Featured registration card ────────────────────────────────────────────────

// ── Coming-soon card (advertised, not yet open) ───────────────────────────────

function ComingSoonCard({ event, timezone }: { event: EventItem; timezone?: string }) {
  const opens = event.registration_opens_at
    ? `Opens ${new Date(event.registration_opens_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', ...(timezone ? { timeZone: timezone } : {}) })}`
    : 'Registration opening soon'
  return (
    <Link
      href={`/events/${event.slug}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {event.event_type && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
            </span>
          )}
          {event.featured && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">★ Featured</span>
          )}
        </div>
        <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}>
          Coming Soon
        </span>
      </div>
      <div className="flex items-start gap-3 mt-2">
        <EventAvatar logoUrl={event.logo_url} name={event.name} sport={event.sport} size="md" className="shrink-0 border border-gray-100" />
        <h3 className="text-lg font-bold leading-snug" style={{ fontFamily: 'var(--brand-heading-font)' }}>{event.name}</h3>
      </div>
      {event.teaser_text && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{event.teaser_text}</p>}
      <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>{opens} →</p>
    </Link>
  )
}

// ── Compact list row ──────────────────────────────────────────────────────────

function EventRow({ event, variant }: { event: EventItem; variant: 'inseason' | 'past' }) {
  const href = variant === 'inseason'
    ? `/events/${event.slug}?tab=schedule`
    : `/events/${event.slug}?tab=standings`

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-5 px-5 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <EventAvatar logoUrl={event.logo_url} name={event.name} sport={event.sport} size="sm" className="border border-gray-100" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{event.name}</p>
          {(event.sport || event.skill_level) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {event.sport ? formatSport(event.sport) : ''}
              {event.sport && event.skill_level ? ' · ' : ''}
              {event.skill_level ? event.skill_level.charAt(0).toUpperCase() + event.skill_level.slice(1) : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {(event.season_start_date || formatTimeRange(event.game_start_time, event.game_end_time)) && (
          <span className="text-xs text-gray-400 hidden sm:block text-right">
            {event.season_start_date && (
              <span>{variant === 'past' ? formatYear(event.season_start_date) : formatDate(event.season_start_date)}</span>
            )}
            {event.season_start_date && formatTimeRange(event.game_start_time, event.game_end_time) && (
              <span className="mx-1">·</span>
            )}
            {formatTimeRange(event.game_start_time, event.game_end_time) && (
              <span>{formatTimeRange(event.game_start_time, event.game_end_time)}</span>
            )}
          </span>
        )}
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

// ── Accordion panel ───────────────────────────────────────────────────────────

function Accordion({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-2xl border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-800">{label}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {count}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-2 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function EventsFilter({ events, timezone }: { events: EventItem[]; timezone?: string }) {
  const [selectedSport, setSelectedSport] = useState<string | null>(null)
  const [selectedType,  setSelectedType]  = useState<string | null>(null)

  // Unique sport / event_type values present in the full list
  const sports = useMemo(() => {
    const seen = new Set<string>()
    events.forEach((e) => { if (e.sport) seen.add(e.sport) })
    return Array.from(seen).sort()
  }, [events])

  const eventTypes = useMemo(() => {
    const seen = new Set<string>()
    events.forEach((e) => { if (e.event_type) seen.add(e.event_type) })
    return Array.from(seen).sort()
  }, [events])

  // Apply active filters
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (selectedSport && e.sport !== selectedSport) return false
      if (selectedType  && e.event_type !== selectedType)  return false
      return true
    })
  }, [events, selectedSport, selectedType])

  const upcoming = filtered
    .filter((e) => e.status === 'draft' && e.advertised)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
  const open     = filtered
    .filter((e) => e.status === 'registration_open')
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
  const inSeason = filtered.filter((e) => e.status === 'active')
  const past     = filtered.filter((e) => e.status === 'completed' || e.status === 'archived')

  const hasFilters = sports.length >= 2 || eventTypes.length >= 2

  return (
    <div className="space-y-4">

      {/* ── Filter pills ────────────────────────────────────────────────────── */}
      {hasFilters && (
        <div className="space-y-2">
          {/* Sport row — horizontally scrollable, no wrap */}
          {sports.length >= 2 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {sports.map((sport) => (
                <button
                  key={sport}
                  onClick={() => setSelectedSport(selectedSport === sport ? null : sport)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    selectedSport === sport
                      ? 'border-transparent text-white'
                      : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                  }`}
                  style={selectedSport === sport ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
                >
                  {SPORT_EMOJI[sport] && <span>{SPORT_EMOJI[sport]}</span>}
                  {formatSport(sport)}
                </button>
              ))}
            </div>
          )}

          {/* Type row — horizontally scrollable, no wrap */}
          {eventTypes.length >= 2 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {eventTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(selectedType === type ? null : type)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    selectedType === type
                      ? 'border-transparent text-white'
                      : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                  }`}
                  style={selectedType === type ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
                >
                  {EVENT_TYPE_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Clear all — only when a filter is active */}
          {(selectedSport || selectedType) && (
            <div className="flex">
              <button
                onClick={() => { setSelectedSport(null); setSelectedType(null) }}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── No results ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="text-center py-14 text-gray-400 text-sm bg-white rounded-2xl border">
          No events match the selected filters.
        </div>
      )}

      {/* ── 0. Coming soon — advertised events not yet open ──────────────────── */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Coming Soon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {upcoming.map((e) => (
              <ComingSoonCard key={e.id} event={e} timezone={timezone} />
            ))}
          </div>
        </div>
      )}

      {/* ── 1. Open for registration — same card as the home page's Open Events ── */}
      {open.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {open.map((e) => (
            <EventCard key={e.id} league={e} spots={e.spots ?? undefined} />
          ))}
        </div>
      )}

      {/* ── 2. In Season accordion ───────────────────────────────────────────── */}
      {inSeason.length > 0 && (
        <Accordion label="In Season" count={inSeason.length} defaultOpen={open.length === 0}>
          {inSeason.map((e) => (
            <EventRow key={e.id} event={e} variant="inseason" />
          ))}
        </Accordion>
      )}

      {/* ── 3. Past Events accordion ─────────────────────────────────────────── */}
      {past.length > 0 && (
        <Accordion label="Past Events" count={past.length} defaultOpen={open.length === 0 && inSeason.length === 0}>
          {past.map((e) => (
            <EventRow key={e.id} event={e} variant="past" />
          ))}
        </Accordion>
      )}

    </div>
  )
}
