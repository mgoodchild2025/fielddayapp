'use client'

import { useState } from 'react'
import Link from 'next/link'
import { List, CalendarDays } from 'lucide-react'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { GameRsvpButton } from '@/components/schedule/game-rsvp-button'
import { GameAttendancePanel } from '@/components/schedule/game-attendance-panel'
import { PlayerCalendar, toLocalDate } from '@/components/ui/player-calendar'
import type { CalendarDot } from '@/components/ui/player-calendar'
import { formatGameTime } from '@/lib/format-time'
import type { GameSub } from '@/actions/game-subs'
import Image from 'next/image'
import { ExhibitionBadge } from '@/components/schedule/game-kind-badge'
import { EmptyState } from '@/components/ui/empty-state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScheduleItem = { _type: 'game' | 'session'; scheduled_at: string; data: any }

function TeamBadge({
  name, logoUrl, color, bold, href,
}: {
  name: string
  logoUrl?: string | null
  color?: string | null
  bold?: boolean
  href?: string
}) {
  const inner = (
    <span className="flex items-center gap-1">
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={16} height={16} className="w-4 h-4 rounded-full object-cover shrink-0" />
      ) : color ? (
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      ) : null}
      <span className={bold ? 'font-semibold' : 'font-medium'}>{name}</span>
    </span>
  )
  if (!href) return inner
  return (
    <Link
      href={href}
      // Rows repeat per game: viewport prefetch would fire one request per
      // link on a phone scroll. Hover/touch still prefetches.
      prefetch={false}
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 hover:underline"
    >
      {inner}
    </Link>
  )
}


function getLeague(item: ScheduleItem): { name: string; slug: string; event_type?: string } | null {
  const raw = item.data.league
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
}

interface Props {
  upcomingItems: ScheduleItem[]
  pastItems: ScheduleItem[]
  myTeamIds: string[]
  captainTeamIds: string[]
  myRsvps: { gameId: string; status: 'in' | 'out' }[]
  captainAttendance: { gameId: string; in: number; out: number; total: number }[]
  mySubGameIds: string[]
  captainGameSubs: { gameId: string; teamId: string; subs: GameSub[] }[]
  userId: string
  timezone: string
}

export function MyGamesClient({
  upcomingItems,
  pastItems,
  myTeamIds,
  captainTeamIds,
  myRsvps,
  captainAttendance,
  mySubGameIds,
  captainGameSubs,
  userId,
  timezone,
}: Props) {
  const [activeLeague, setActiveLeague] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')

  const teamIdSet = new Set(myTeamIds)
  const captainTeamIdSet = new Set(captainTeamIds)
  const rsvpMap = new Map(myRsvps.map((r) => [r.gameId, r.status]))
  const attendanceMap = new Map(captainAttendance.map((a) => [a.gameId, { in: a.in, out: a.out, total: a.total }]))
  const mySubGameIdSet = new Set(mySubGameIds)
  const captainSubsMap = new Map(captainGameSubs.map((g) => [g.gameId, { teamId: g.teamId, subs: g.subs }]))

  // Derive unique leagues, preserving first-seen order
  const leagueMap = new Map<string, string>()
  for (const item of [...upcomingItems, ...pastItems]) {
    const league = getLeague(item)
    if (league?.slug && league?.name && !leagueMap.has(league.slug)) {
      leagueMap.set(league.slug, league.name)
    }
  }
  const leagues = Array.from(leagueMap.entries()) // [slug, name][]

  function filterItems(items: ScheduleItem[]) {
    if (!activeLeague) return items
    return items.filter((item) => getLeague(item)?.slug === activeLeague)
  }

  const filteredUpcoming = filterItems(upcomingItems)
  const filteredPast = filterItems(pastItems)

  function renderItem(item: ScheduleItem) {
    if (item._type === 'game') {
      const g = item.data
      const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
      const league   = getLeague(item)
      const { date: gameDate, time: gameTime } = formatGameTime(g.scheduled_at, timezone)
      const homeColor    = homeTeam?.color as string | null | undefined
      const awayColor    = awayTeam?.color as string | null | undefined
      const homeLogoUrl  = homeTeam?.logo_url as string | null | undefined
      const awayLogoUrl  = awayTeam?.logo_url as string | null | undefined
      const isHomeMyTeam = teamIdSet.has(homeTeam?.id)
      const isAwayMyTeam = teamIdSet.has(awayTeam?.id)
      const isCancelled  = g.status === 'cancelled' || g.status === 'postponed'

      // RSVP: determine which team the player is on for this game
      const myTeamId = isHomeMyTeam
        ? (homeTeam?.id ?? null)
        : isAwayMyTeam
          ? (awayTeam?.id ?? null)
          : null

      // Captain attendance panel
      const captainTeamIdForGame = captainTeamIdSet.has(homeTeam?.id)
        ? homeTeam?.id
        : captainTeamIdSet.has(awayTeam?.id)
          ? awayTeam?.id
          : null

      // The player's result on past games: "W 21–18" from their side.
      const res = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
      const hasFinal = res?.status === 'confirmed' && res.home_score != null && res.away_score != null
      const mine = hasFinal && myTeamId
        ? (myTeamId === homeTeam?.id ? [res.home_score, res.away_score] : [res.away_score, res.home_score]) as [number, number]
        : null
      const outcome = mine ? (mine[0] > mine[1] ? 'W' : mine[0] < mine[1] ? 'L' : 'T') : null

      const rsvpStatus = rsvpMap.get(g.id) ?? null
      const attendance = captainTeamIdForGame ? (attendanceMap.get(g.id) ?? null) : null
      const captainSubInfo = captainSubsMap.get(g.id) ?? null
      const isSubGame = mySubGameIdSet.has(g.id)

      return (
        <div
          key={`game-${g.id}`}
          className={`relative border rounded-md p-3 transition-shadow hover:shadow-md bg-white${isCancelled ? ' opacity-60' : ''}`}
        >
          <Link
            href={g.isPlayoff ? `/events/${league?.slug ?? ''}?tab=bracket` : `/games/${g.id}`}
            prefetch={false}
            className="absolute inset-0 rounded-md"
            aria-label={g.isPlayoff ? 'View bracket' : 'View game details'}
          />
          <div className="flex items-start justify-between gap-2">
            {/* When and where are what a player scans for — the strongest text
                on the row, not the faintest. */}
            <p className="text-sm">
              <span className="font-semibold text-gray-900">{gameDate} · {gameTime}</span>
              {g.court ? <span className="text-gray-700"> · {g.court}</span> : ''}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {mine && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded tabular-nums leading-tight ${
                  outcome === 'W' ? 'bg-green-100 text-green-800' : outcome === 'L' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {outcome} {mine[0]}–{mine[1]}
                </span>
              )}
              {!mine && hasFinal && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 tabular-nums leading-tight">
                  {res.home_score}–{res.away_score}
                </span>
              )}
              {isSubGame && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 leading-tight">
                  Sub
                </span>
              )}
              <ExhibitionBadge isExhibition={g.is_exhibition} />
              {g.isPlayoff && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 leading-tight">
                  Playoff
                </span>
              )}
              {isCancelled ? (
                <span className={`text-xs font-medium rounded px-1.5 py-0.5 leading-tight ${g.status === 'postponed' ? 'text-amber-800 bg-amber-50' : 'text-red-700 bg-red-50'}`}>
                  {g.status === 'postponed' ? 'Postponed' : 'Cancelled'}
                </span>
              ) : g.week_number != null && league?.event_type !== 'tournament' ? (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 leading-tight">
                  Wk {g.week_number}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <TeamBadge
              name={homeTeam?.name ?? 'TBD'}
              logoUrl={homeLogoUrl}
              color={homeColor}
              bold={isHomeMyTeam}
              href={homeTeam?.id ? `/teams/${homeTeam.id}/stats` : undefined}
            />
            <span className="text-gray-500 text-sm mx-0.5">vs</span>
            <TeamBadge
              name={awayTeam?.name ?? 'TBD'}
              logoUrl={awayLogoUrl}
              color={awayColor}
              bold={isAwayMyTeam}
              href={awayTeam?.id ? `/teams/${awayTeam.id}/stats` : undefined}
            />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {[league?.name, g.isPlayoff ? [g.playoffTier, g.playoffRound].filter(Boolean).join(' · ') : null].filter(Boolean).join(' · ')}
          </p>
          {isCancelled && (g as { cancellation_reason?: string | null }).cancellation_reason && (
            <p className="text-xs text-red-700 mt-0.5">{(g as { cancellation_reason?: string | null }).cancellation_reason}</p>
          )}

          {/* RSVP + attendance — only for non-cancelled, non-playoff games
              (playoff bracket games are read-only). */}
          {!isCancelled && !g.isPlayoff && (attendance || myTeamId) && (
            <div className="relative z-10 mt-2 flex items-center gap-3 flex-wrap">
              {attendance && captainTeamIdForGame && (
                <GameAttendancePanel
                  gameId={g.id}
                  teamId={captainTeamIdForGame}
                  initialCounts={attendance}
                  isCaptain={true}
                  gameSubs={captainSubInfo?.subs ?? []}
                />
              )}
              {myTeamId && (
                <GameRsvpButton
                  gameId={g.id}
                  teamId={myTeamId}
                  initialStatus={rsvpStatus}
                />
              )}
            </div>
          )}
        </div>
      )
    }

    // Pickup session
    const s      = item.data
    const league = getLeague(item)
    const { date: sessionDate, time: sessionTime } = formatGameTime(s.scheduled_at, timezone)
    const location = s.location_override as string | null
    return (
      <div key={`session-${s.id}`} className="relative border rounded-md p-3 transition-shadow hover:shadow-md bg-white">
        {league?.slug && (
          <Link
            href={`/events/${league.slug}`}
            className="absolute inset-0 rounded-md"
            aria-label={`View ${league.name ?? 'event'}`}
          />
        )}
        <p className="text-sm text-gray-500">
          {sessionDate} · {sessionTime}
          {location ? ` · ${location}` : ''}
        </p>
        <p className="font-medium mt-0.5">Pickup Session</p>
        <p className="text-xs text-gray-500">{league?.name}</p>
      </div>
    )
  }

  // Build calendar dots from all items
  const allItems = [...upcomingItems, ...pastItems]
  const calendarDots: CalendarDot[] = allItems
    .filter(item => {
      if (!activeLeague) return true
      return getLeague(item)?.slug === activeLeague
    })
    .map(item => {
      const league = getLeague(item)
      if (item._type === 'game') {
        const g = item.data
        const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
        const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
        const isHome = teamIdSet.has(homeTeam?.id)
        const myTeamColor = isHome ? (homeTeam?.color ?? null) : (awayTeam?.color ?? null)
        const opponent = isHome ? awayTeam : homeTeam
        return {
          id: `g-${g.id}`,
          date: toLocalDate(item.scheduled_at, timezone),
          color: myTeamColor,
          label: `vs ${opponent?.name ?? 'TBD'}${league?.name ? ` · ${league.name}` : ''}`,
          href: `/games/${g.id}`,
        } satisfies CalendarDot
      }
      // session
      return {
        id: `s-${item.data.id}`,
        date: toLocalDate(item.scheduled_at, timezone),
        color: null,
        label: `Pickup Session${league?.name ? ` · ${league.name}` : ''}`,
        href: league?.slug ? `/events/${league.slug}` : '#',
      } satisfies CalendarDot
    })

  return (
    <>
      {/* Filter pills + view mode toggle */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {leagues.length > 1 && (
          <>
            <button
              onClick={() => setActiveLeague(null)}
              aria-pressed={!activeLeague}
              className={`press min-h-10 px-4 rounded-full text-sm font-medium ${
                !activeLeague ? 'bg-brand-primary text-on-brand' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {leagues.map(([slug, name]) => (
              <button
                key={slug}
                onClick={() => setActiveLeague(activeLeague === slug ? null : slug)}
                aria-pressed={activeLeague === slug}
                className={`press min-h-10 px-4 rounded-full text-sm font-medium ${
                  activeLeague === slug ? 'bg-brand-primary text-on-brand' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            ))}
          </>
        )}
        {/* Spacer */}
        <div className="flex-1" />
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`press inline-flex items-center justify-center min-h-10 min-w-10 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="List view"
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            aria-pressed={viewMode === 'calendar'}
            className={`press inline-flex items-center justify-center min-h-10 min-w-10 rounded-md ${viewMode === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Calendar view"
            title="Calendar view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <PlayerCalendar dots={calendarDots} timezone={timezone} />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <>
          {/* Upcoming */}
          <div className="space-y-2">
            {filteredUpcoming.length > 0
              ? filteredUpcoming.map(renderItem)
              : (
                <EmptyState
                  icon={CalendarDays}
                  title={activeLeague ? 'No upcoming games for this league.' : 'No upcoming games yet.'}
                  hint={activeLeague ? undefined : 'They show up here as soon as your league publishes its schedule.'}
                  action={activeLeague ? undefined : { href: '/events', label: 'Browse events' }}
                />
              )
            }
          </div>

          {/* Past games — collapsed by default */}
          {filteredPast.length > 0 && (
            <PastGamesToggle count={filteredPast.length}>
              {filteredPast.map(renderItem)}
            </PastGamesToggle>
          )}
        </>
      )}
    </>
  )
}
