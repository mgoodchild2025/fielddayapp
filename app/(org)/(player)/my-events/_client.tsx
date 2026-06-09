'use client'

import { useState } from 'react'
import Link from 'next/link'
import { List, CalendarDays } from 'lucide-react'
import { QRCodeDisplay } from '@/components/checkin/qr-code-display'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { EventAvatar } from '@/components/ui/event-avatar'
import { PlayerCalendar, toLocalDate } from '@/components/ui/player-calendar'
import type { CalendarDot } from '@/components/ui/player-calendar'
import { leagueColor } from '@/lib/league-color'

export interface GameDotItem {
  leagueId: string
  date: string  // YYYY-MM-DD in org tz
  label: string
  href: string
}

export interface EventItem {
  registrationId: string
  registrationStatus: string
  checkinUrl: string | null
  registrationType: string | null
  sessionScheduledAt: string | null
  league: {
    id: string
    name: string
    slug: string
    league_status: string
    event_type: string | null
    sport: string | null
    logo_url: string | null
    season_start_date: string | null
    season_end_date: string | null
    checkin_enabled: boolean
  }
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  registration_open: { label: 'Open',       className: 'bg-green-50 text-green-700'   },
  active:            { label: 'In Season',  className: 'bg-blue-50 text-blue-700'     },
  completed:         { label: 'Completed',  className: 'bg-gray-100 text-gray-500'    },
  archived:          { label: 'Archived',   className: 'bg-gray-100 text-gray-400'    },
  draft:             { label: 'Draft',      className: 'bg-yellow-50 text-yellow-700' },
}

interface Props {
  currentEvents: EventItem[]
  pastEvents: EventItem[]
  timezone: string
  gameDots?: GameDotItem[]
}

function formatSport(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function EventCard({ item, timezone, faded }: { item: EventItem; timezone: string; faded?: boolean }) {
  const { registrationId, registrationStatus, checkinUrl, league, sessionScheduledAt, registrationType } = item
  const statusInfo = STATUS_LABEL[league.league_status] ?? { label: league.league_status, className: 'bg-gray-100 text-gray-500' }
  const isActive = registrationStatus === 'active'
  const showQR = isActive && !!checkinUrl && ['active', 'registration_open'].includes(league.league_status) && league.checkin_enabled === true
  const isDropIn = registrationType === 'drop_in'
  const sessionLabel = sessionScheduledAt
    ? new Date(sessionScheduledAt).toLocaleString('en-CA', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: timezone,
      })
    : null

  return (
    <div key={registrationId} className="bg-white rounded-xl border overflow-hidden">
      <Link
        href={`/events/${league.slug}`}
        className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors group"
      >
        <EventAvatar
          logoUrl={league.logo_url ?? null}
          name={league.name}
          sport={league.sport ?? null}
          size="sm"
          className={`shrink-0 border border-gray-100${faded ? ' opacity-60' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 truncate">{league.name}</p>
            {isDropIn && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-purple-50 text-purple-700">
                Drop-in
              </span>
            )}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {league.sport ? formatSport(league.sport) : ''}
            {sessionLabel
              ? <>{league.sport ? ' · ' : ''}<span className="font-medium text-gray-500">{sessionLabel}</span></>
              : <>{league.sport && league.season_start_date ? ' · ' : ''}{formatDate(league.season_start_date) ?? ''}</>
            }
          </p>
        </div>
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
      {showQR && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <QRCodeDisplay
            checkinUrl={checkinUrl}
            playerName=""
            eventName={league.name}
            size={180}
          />
        </div>
      )}
    </div>
  )
}

export function MyEventsClient({ currentEvents, pastEvents, timezone, gameDots = [] }: Props) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')

  const allEvents = [...currentEvents, ...pastEvents]

  // Game-day dots (actual scheduled game dates from the server)
  const calendarDots: CalendarDot[] = [
    // Specific game dates per league
    ...gameDots.map(d => ({
      id: `game-${d.leagueId}-${d.date}`,
      date: d.date,
      color: leagueColor(d.leagueId),
      label: d.label,
      href: d.href,
    })),
    // Drop-in session dots (one-off specific sessions)
    ...allEvents
      .filter(e => e.sessionScheduledAt)
      .map(e => ({
        id: e.registrationId,
        date: toLocalDate(e.sessionScheduledAt!, timezone),
        color: leagueColor(e.league.id),
        label: `${e.league.name} (Drop-in)`,
        href: `/events/${e.league.slug}`,
      })),
  ]

  // No bands — events now appear only on their actual game days
  const calendarBands: import('@/components/ui/player-calendar').CalendarBand[] = []

  const isEmpty = allEvents.length === 0

  if (isEmpty) {
    return (
      <div className="bg-white rounded-xl border p-10 text-center">
        <p className="text-gray-400 text-sm mb-3">You haven&apos;t registered for any events yet.</p>
        <Link
          href="/events"
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Browse Events
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* View mode toggle */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="List view"
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Calendar view"
            title="Calendar view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <PlayerCalendar dots={calendarDots} bands={calendarBands} timezone={timezone} />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div>
          <div className="space-y-3">
            {currentEvents.map(item => (
              <EventCard key={item.registrationId} item={item} timezone={timezone} />
            ))}
          </div>

          {pastEvents.length > 0 && (
            <PastGamesToggle count={pastEvents.length} label="events">
              <div className="space-y-3">
                {pastEvents.map(item => (
                  <EventCard key={item.registrationId} item={item} timezone={timezone} faded />
                ))}
              </div>
            </PastGamesToggle>
          )}
        </div>
      )}
    </>
  )
}
