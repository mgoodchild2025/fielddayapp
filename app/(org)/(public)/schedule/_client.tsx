'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { GameRsvpButton } from '@/components/schedule/game-rsvp-button'
import { GameAttendancePanel } from '@/components/schedule/game-attendance-panel'
import { formatGameTime } from '@/lib/format-time'
import type { GameSub } from '@/actions/game-subs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScheduleItem = { _type: 'game' | 'session'; scheduled_at: string; data: any }

function TeamBadge({
  name, logoUrl, color, bold,
}: {
  name: string
  logoUrl?: string | null
  color?: string | null
  bold?: boolean
}) {
  return (
    <span className="flex items-center gap-1">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="w-4 h-4 rounded-full object-cover shrink-0" />
      ) : color ? (
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      ) : null}
      <span className={bold ? 'font-semibold' : 'font-medium'}>{name}</span>
    </span>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            href={`/games/${g.id}`}
            className="absolute inset-0 rounded-md"
            aria-label="View game details"
          />
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-500">
              {gameDate} · {gameTime}
              {g.court ? ` · ${g.court}` : ''}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isSubGame && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 leading-tight">
                  Sub
                </span>
              )}
              {isCancelled ? (
                <span className="text-xs font-medium text-red-500 bg-red-50 rounded px-1.5 py-0.5 leading-tight">
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
            <TeamBadge name={homeTeam?.name ?? 'TBD'} logoUrl={homeLogoUrl} color={homeColor} bold={isHomeMyTeam} />
            <span className="text-gray-400 text-sm mx-0.5">vs</span>
            <TeamBadge name={awayTeam?.name ?? 'TBD'} logoUrl={awayLogoUrl} color={awayColor} bold={isAwayMyTeam} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{league?.name}</p>

          {/* RSVP + attendance — only for non-cancelled games */}
          {!isCancelled && (attendance || myTeamId) && (
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
        <p className="text-xs text-gray-400">{league?.name}</p>
      </div>
    )
  }

  return (
    <>
      {/* Filter pills — only shown when in multiple leagues */}
      {leagues.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setActiveLeague(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              !activeLeague ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={!activeLeague ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            All
          </button>
          {leagues.map(([slug, name]) => (
            <button
              key={slug}
              onClick={() => setActiveLeague(activeLeague === slug ? null : slug)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeLeague === slug ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={activeLeague === slug ? { backgroundColor: 'var(--brand-primary)' } : {}}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Upcoming */}
      <div className="space-y-2">
        {filteredUpcoming.length > 0
          ? filteredUpcoming.map(renderItem)
          : (
            <div className="border rounded-md p-6 text-center text-sm text-gray-400 bg-white">
              {activeLeague
                ? 'No upcoming games for this league.'
                : 'No upcoming games — check back when your league publishes the schedule.'}
            </div>
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
  )
}
