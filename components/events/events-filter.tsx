'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export interface EventItem {
  id: string
  name: string
  slug: string
  status: string
  event_type: string | null
  sport: string | null
  price_cents: number
  currency: string
  season_start_date: string | null
  max_teams: number | null
  team_count: number
  payment_mode: string | null
  skill_level: string | null
  days_of_week: string[] | null
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
  clinic:     'Clinic',
  camp:       'Camp',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSport(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPrice(cents: number, currency: string) {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(0)} ${currency.toUpperCase()}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatYear(iso: string) {
  return new Date(iso).getFullYear()
}

// ── Featured registration card ────────────────────────────────────────────────

function FeaturedCard({ event, isOrgAdmin }: { event: EventItem; isOrgAdmin: boolean }) {
  const isPerTeam = event.payment_mode === 'per_team'
  const teamsAtCapacity = isPerTeam && event.max_teams !== null && event.team_count >= event.max_teams
  const isFull = !isPerTeam && event.max_teams !== null && event.team_count >= event.max_teams
  const showCapacity = event.max_teams !== null

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex flex-col bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Accent bar */}
      <div className={`h-1.5 w-full shrink-0 ${
        isFull ? 'bg-gray-300' : teamsAtCapacity ? 'bg-amber-400' : 'bg-green-500'
      }`} />

      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Status badge + capacity fraction */}
        <div className="flex items-center justify-between gap-2">
          {isFull ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Event Full
            </span>
          ) : teamsAtCapacity ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Teams Full
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Open for Registration
            </span>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {showCapacity && (
              <span className={`text-xs font-semibold tabular-nums ${
                isFull ? 'text-red-500' : teamsAtCapacity ? 'text-amber-600' : 'text-gray-400'
              }`}>
                {event.team_count} / {event.max_teams} teams
              </span>
            )}
            {event.sport && !showCapacity && (
              <span className="text-xs text-gray-400 font-medium">{formatSport(event.sport)}</span>
            )}
          </div>
        </div>

        {/* Name + date */}
        <div>
          <h2
            className="text-xl font-bold text-gray-900 leading-snug"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            {event.name}
          </h2>
          {event.season_start_date && (
            <p className="text-sm text-gray-400 mt-1">
              Starts {formatDate(event.season_start_date)}
            </p>
          )}
        </div>

        {/* Metadata chips */}
        {(event.skill_level || (event.days_of_week?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {event.skill_level && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
                {event.skill_level}
              </span>
            )}
            {event.days_of_week?.map((d) => (
              <span key={d} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
                {d}
              </span>
            ))}
          </div>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          {teamsAtCapacity ? (
            <span className="text-sm text-amber-700 font-medium">Players can still join a team</span>
          ) : (
            <span className={`text-base font-bold ${isFull ? 'text-gray-400' : 'text-green-600'}`}>
              {formatPrice(event.price_cents, event.currency)}
            </span>
          )}
          {isFull ? (
            <span className="text-sm font-semibold px-3 py-1.5 rounded-lg text-gray-400 bg-gray-100 cursor-default">
              Event Full
            </span>
          ) : teamsAtCapacity ? (
            <span className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white bg-amber-500 group-hover:bg-amber-600 transition-colors">
              Join a Team →
            </span>
          ) : (
            <span className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white bg-green-500 group-hover:bg-green-600 transition-colors">
              Register →
            </span>
          )}
        </div>
      </div>
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
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: variant === 'inseason' ? 'var(--brand-primary)' : '#d1d5db' }}
        />
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
        {event.season_start_date && (
          <span className="text-xs text-gray-400 hidden sm:block">
            {variant === 'past' ? formatYear(event.season_start_date) : formatDate(event.season_start_date)}
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

export function EventsFilter({ events, isOrgAdmin = false }: { events: EventItem[]; isOrgAdmin?: boolean }) {
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

  const open     = filtered.filter((e) => e.status === 'registration_open')
  const inSeason = filtered.filter((e) => e.status === 'active')
  const past     = filtered.filter((e) => e.status === 'completed' || e.status === 'archived')

  const hasFilters = sports.length >= 2 || eventTypes.length >= 2

  return (
    <div className="space-y-4">

      {/* ── Filter pills ────────────────────────────────────────────────────── */}
      {hasFilters && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* Sport pills */}
          {sports.length >= 2 && sports.map((sport) => (
            <button
              key={`sport-${sport}`}
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

          {/* Divider between groups */}
          {sports.length >= 2 && eventTypes.length >= 2 && (
            <div className="w-px bg-gray-200 shrink-0 my-1" />
          )}

          {/* Event type pills */}
          {eventTypes.length >= 2 && eventTypes.map((type) => (
            <button
              key={`type-${type}`}
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

      {/* ── No results ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="text-center py-14 text-gray-400 text-sm bg-white rounded-2xl border">
          No events match the selected filters.
        </div>
      )}

      {/* ── 1. Open for registration — featured cards ────────────────────────── */}
      {open.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {open.map((e) => (
            <FeaturedCard key={e.id} event={e} isOrgAdmin={isOrgAdmin} />
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
