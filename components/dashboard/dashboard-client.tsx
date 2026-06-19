'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  Clock,
  MapPin,
  Trophy,
  ShoppingBag,
  ClipboardList,
  Calendar,
  ChevronRight,
  BarChart3,
  Users,
  AlertCircle,
} from 'lucide-react'
import { upsertRsvp } from '@/actions/rsvp'

// ── Types ─────────────────────────────────────────────────────────────────────

/** The soonest upcoming team game across all the player's teams */
export type NextGameItem = {
  kind: 'game'
  teamId: string
  teamName: string
  teamColor: string | null
  teamLogoUrl: string | null
  // Game details
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  opponentName: string
  opponentColor: string | null
  opponentLogoUrl: string | null
  isHome: boolean
  leagueName: string
  rsvpIn: number
  rsvpOut: number
  myRsvp: 'in' | 'out' | null
}

/** The soonest upcoming pickup / drop-in / session event */
export type NextSessionItem = {
  kind: 'session'
  id: string
  scheduledAt: string
  leagueName: string
  leagueSlug: string
  leagueSport: string | null
  eventType: string   // 'pickup' | 'drop_in' | 'league' etc.
  duration: number | null
  location: string | null
}

export type NextItem = NextGameItem | NextSessionItem | null

export type RecentResult = {
  gameId: string
  scheduledAt: string
  opponentName: string
  homeScore: number
  awayScore: number
  isHome: boolean
  outcome: 'W' | 'L' | 'T'
}

/** Stats + recent results for a single team — drives the tabs section */
export type DashboardTeam = {
  teamId: string
  teamName: string
  teamColor: string | null
  teamLogoUrl: string | null
  role: string
  leagueId: string
  leagueName: string
  leagueSlug: string
  leagueSport: string | null
  record: {
    wins: number
    losses: number
    ties: number
    played: number
    points: number
    standing: number | null
    totalTeams: number | null
  }
  recentResults: RecentResult[]
}

export type PendingAction = {
  type: 'waiver' | 'pending_registration' | 'pending_payment'
  label: string
  sublabel: string
  href: string
}

interface Props {
  firstName: string
  timezone: string
  nextItem: NextItem
  teams: DashboardTeam[]
  pendingActions: PendingAction[]
  logoUrl: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: tz,
  })
}

function formatTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  })
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function daysUntil(iso: string, tz: string): string {
  // Compare calendar days in the org timezone — not raw elapsed time, which
  // mislabels a game later *today* as "Tomorrow" (and shifts across timezones).
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz })  // → YYYY-MM-DD
  const toDays = (d: Date) => {
    const [y, m, day] = fmt.format(d).split('-').map(Number)
    return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000)
  }
  const diff = toDays(new Date(iso)) - toDays(new Date())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return 'Past'
  return `In ${diff} day${diff !== 1 ? 's' : ''}`
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatEventType(et: string): string {
  return et.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

// ── TeamCircle ────────────────────────────────────────────────────────────────

function TeamCircle({
  name, color, logoUrl, size = 56,
}: { name: string; color: string | null; logoUrl: string | null; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const bg = color ?? '#6b7280'
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0 select-none overflow-hidden"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.3 }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
      ) : initials}
    </div>
  )
}

// ── GameHero ─────────────────────────────────────────────────────────────────

function GameHero({
  item, timezone, rsvpIn, rsvpOut, myRsvp, onRsvp,
}: {
  item: NextGameItem
  timezone: string
  rsvpIn: number
  rsvpOut: number
  myRsvp: 'in' | 'out' | null
  onRsvp: (status: 'in' | 'out') => void
}) {
  return (
    <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
      {/* Dark header */}
      <div className="flex items-center justify-between px-5 py-2.5" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        <span className="text-xs font-bold uppercase tracking-widest text-white/50">
          {item.weekNumber ? `Week ${item.weekNumber} · ${item.leagueName}` : item.leagueName}
        </span>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">
          {daysUntil(item.scheduledAt, timezone)}
        </span>
      </div>

      {/* Matchup */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-center gap-4">
          {/* My team */}
          <div className="flex-1 flex flex-col items-center gap-2 text-center max-w-[160px]">
            <TeamCircle name={item.teamName} color={item.teamColor} logoUrl={item.teamLogoUrl} size={64} />
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">{item.teamName}</p>
              <span
                className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', color: 'var(--brand-primary)' }}
              >
                You
              </span>
            </div>
          </div>

          <span className="text-lg font-bold text-gray-200 shrink-0 w-8 text-center">vs</span>

          {/* Opponent */}
          <div className="flex-1 flex flex-col items-center gap-2 text-center max-w-[160px]">
            <TeamCircle
              name={item.opponentName}
              color={item.opponentColor}
              logoUrl={item.opponentLogoUrl}
              size={64}
            />
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">{item.opponentName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.leagueName}</p>
            </div>
          </div>
        </div>

        {/* Game meta */}
        <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900">{formatDate(item.scheduledAt, timezone)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900">{formatTime(item.scheduledAt, timezone)}</span>
          </div>
          {item.court && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{item.court}</span>
            </div>
          )}
        </div>
      </div>

      {/* RSVP footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {rsvpIn} in
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            {rsvpOut} out
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRsvp('out')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              myRsvp === 'out'
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {myRsvp === 'out' ? '✗ Can\'t make it' : 'Can\'t make it'}
          </button>
          <button
            onClick={() => onRsvp('in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              myRsvp === 'in' ? 'opacity-100' : 'opacity-70 hover:opacity-100'
            } text-white`}
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {myRsvp === 'in' ? '✓ I\'m in' : 'I\'m in'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SessionHero ───────────────────────────────────────────────────────────────

function SessionHero({ item, timezone }: { item: NextSessionItem; timezone: string }) {
  return (
    <Link href={`/events/${item.leagueSlug}`} className="block bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Dark header */}
      <div className="flex items-center justify-between px-5 py-2.5" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        <span className="text-xs font-bold uppercase tracking-widest text-white/50">
          {formatEventType(item.eventType)}
        </span>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">
          {daysUntil(item.scheduledAt, timezone)}
        </span>
      </div>

      <div className="px-6 pt-6 pb-5">
        {/* Event name */}
        <div className="flex flex-col items-center gap-3 text-center mb-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}
          >
            <CalendarDays className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg leading-tight">{item.leagueName}</p>
            {item.leagueSport && (
              <p className="text-sm text-gray-400 mt-0.5">
                {item.leagueSport.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
            )}
          </div>
        </div>

        {/* Session meta */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900">{formatDate(item.scheduledAt, timezone)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900">{formatTime(item.scheduledAt, timezone)}</span>
          </div>
          {item.location && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{item.location}</span>
            </div>
          )}
          {item.duration && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <span>{item.duration} min</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--brand-primary)' }}>
          View event details <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient({ firstName, timezone, nextItem, teams, pendingActions }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)

  // RSVP state — only relevant when nextItem is a game
  const initialRsvp = nextItem?.kind === 'game' ? nextItem.myRsvp : null
  const initialIn   = nextItem?.kind === 'game' ? nextItem.rsvpIn  : 0
  const initialOut  = nextItem?.kind === 'game' ? nextItem.rsvpOut : 0
  const [myRsvp, setMyRsvp] = useState<'in' | 'out' | null>(initialRsvp)
  const [rsvpIn,  setRsvpIn]  = useState(initialIn)
  const [rsvpOut, setRsvpOut] = useState(initialOut)
  const [, startTransition] = useTransition()

  const team = teams[activeIdx] ?? null

  function handleRsvp(gameId: string, teamId: string, status: 'in' | 'out') {
    if (myRsvp === status) return
    const prev = myRsvp
    // Optimistic update
    setMyRsvp(status)
    setRsvpIn((n)  => status === 'in'  ? n + 1 : prev === 'in'  ? Math.max(0, n - 1) : n)
    setRsvpOut((n) => status === 'out' ? n + 1 : prev === 'out' ? Math.max(0, n - 1) : n)
    startTransition(async () => {
      const result = await upsertRsvp(gameId, teamId, status)
      if (result.error) {
        setMyRsvp(prev)
        setRsvpIn((n)  => status === 'in'  ? Math.max(0, n - 1) : prev === 'in'  ? n + 1 : n)
        setRsvpOut((n) => status === 'out' ? Math.max(0, n - 1) : prev === 'out' ? n + 1 : n)
      }
    })
  }

  // ── Empty state (no active teams AND no upcoming sessions) ────────────────
  if (teams.length === 0 && !nextItem) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-gray-100">
          <Trophy className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Nothing on your schedule yet</h2>
        <p className="text-gray-500 text-sm mb-6">Register for an event to get started.</p>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Browse Events
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">

      {/* ── Greeting ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{todayLabel()}</p>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {greeting()}, {firstName}
        </h1>
      </div>

      {/* ── Action banners ── */}
      {pendingActions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 hover:bg-amber-100 transition-colors"
        >
          {action.type === 'pending_payment'
            ? <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            : <ClipboardList className="w-5 h-5 text-amber-500 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">{action.label}</p>
            <p className="text-xs text-amber-700 mt-0.5">{action.sublabel}</p>
          </div>
          <span className="text-xs font-bold text-amber-700 shrink-0 flex items-center gap-0.5">
            {action.type === 'pending_payment' ? 'View' : 'Complete'} <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      ))}

      {/* ── What's Next hero (global — game or session, whichever is sooner) ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            {nextItem?.kind === 'session' ? 'Next Session' : 'Next Game'}
          </h2>
          <Link href="/schedule" className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
            Full schedule →
          </Link>
        </div>

        {nextItem?.kind === 'game' ? (
          <GameHero
            item={nextItem}
            timezone={timezone}
            rsvpIn={rsvpIn}
            rsvpOut={rsvpOut}
            myRsvp={myRsvp}
            onRsvp={(status) => handleRsvp(nextItem.id, nextItem.teamId, status)}
          />
        ) : nextItem?.kind === 'session' ? (
          <SessionHero item={nextItem} timezone={timezone} />
        ) : (
          <div className="bg-white rounded-2xl border p-10 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center bg-gray-50">
              <Calendar className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No upcoming games or sessions</p>
            <p className="text-xs text-gray-400 mt-1">Check back soon — your schedule will appear here.</p>
          </div>
        )}
      </section>

      {/* ── Team tabs (only when multiple active teams) ── */}
      {teams.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {teams.map((t, i) => (
            <button
              key={t.teamId}
              onClick={() => setActiveIdx(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                i === activeIdx
                  ? 'text-white shadow-sm'
                  : 'bg-white border text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={i === activeIdx ? { backgroundColor: t.teamColor ?? 'var(--brand-primary)' } : undefined}
            >
              <TeamCircle name={t.teamName} color={t.teamColor} logoUrl={t.teamLogoUrl} size={20} />
              {t.teamName}
            </button>
          ))}
        </div>
      )}

      {/* ── Per-team stats + results (only when user has active teams) ── */}
      {team && (
        <>
          {/* Season stats */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Season Stats · {team.teamName}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <Link href={`/teams/${team.teamId}/stats`} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Record</p>
                <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-secondary)' }}>
                  <span>{team.record.wins}</span>
                  <span className="text-sm font-bold text-gray-400 ml-0.5">W</span>
                  {' '}
                  <span>{team.record.losses}</span>
                  <span className="text-sm font-bold text-gray-400 ml-0.5">L</span>
                  {team.record.ties > 0 && (
                    <>
                      {' '}
                      <span>{team.record.ties}</span>
                      <span className="text-sm font-bold text-gray-400 ml-0.5">T</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-gray-400 mt-1.5">{team.record.played} played</p>
              </Link>

              <Link href={`/teams/${team.teamId}/stats`} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Standing</p>
                {team.record.standing !== null ? (
                  <>
                    <p className="text-2xl font-extrabold tracking-tight leading-none">
                      <span style={{ color: 'var(--brand-primary)' }}>
                        {team.record.standing}{ordinal(team.record.standing)}
                      </span>
                      {team.record.totalTeams !== null && (
                        <span className="text-sm font-semibold text-gray-400 ml-0.5"> / {team.record.totalTeams}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1.5 truncate">{team.leagueName}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">—</p>
                )}
              </Link>

              <Link href={`/teams/${team.teamId}/stats`} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Points</p>
                <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-primary)' }}>
                  {team.record.points}
                </p>
                <p className="text-[11px] text-gray-400 mt-1.5">{team.record.wins}W · {team.record.ties}T · {team.record.losses}L</p>
              </Link>
            </div>
          </section>

          {/* Two-column: Recent results + team card + quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Recent Results */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Recent Results</h2>
                <Link href="/schedule" className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                  See all →
                </Link>
              </div>

              {team.recentResults.length === 0 ? (
                <div className="bg-white rounded-xl border p-6 text-center text-sm text-gray-400">
                  No results yet this season
                </div>
              ) : (
                <div className="space-y-2">
                  {team.recentResults.map((r) => (
                    <div key={r.gameId} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        r.outcome === 'W' ? 'bg-emerald-50 text-emerald-600' :
                        r.outcome === 'L' ? 'bg-red-50 text-red-500' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {r.outcome}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {r.isHome
                            ? `${team.teamName} vs ${r.opponentName}`
                            : `${r.opponentName} vs ${team.teamName}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {r.isHome ? `${r.homeScore} – ${r.awayScore}` : `${r.awayScore} – ${r.homeScore}`}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{formatShortDate(r.scheduledAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Team card + quick links */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">My Team</h2>
                {teams.length > 1 && (
                  <Link href="/my-teams" className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    All teams →
                  </Link>
                )}
              </div>

              <Link
                href={`/teams/${team.teamId}`}
                className="flex items-center gap-4 bg-white border rounded-xl px-4 py-4 hover:shadow-md transition-shadow group mb-3"
              >
                <TeamCircle name={team.teamName} color={team.teamColor} logoUrl={team.teamLogoUrl} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{team.teamName}</p>
                    {team.role === 'captain' && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)', color: 'var(--brand-primary)' }}
                      >
                        Captain
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{team.leagueName}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" />
              </Link>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { href: '/events',    Icon: Trophy,       label: 'Browse Events' },
                  { href: '/standings', Icon: BarChart3,    label: 'Standings'     },
                  { href: '/schedule',  Icon: CalendarDays, label: 'Schedule'      },
                  { href: '/shop',      Icon: ShoppingBag,  label: 'Shop'          },
                ] as const).map(({ href, Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 bg-white border rounded-xl px-3 py-3 hover:shadow-sm transition-shadow group"
                  >
                    <Icon className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
                  </Link>
                ))}
              </div>
            </section>

          </div>
        </>
      )}

      {/* ── Quick links for session-only players (no active team) ── */}
      {!team && nextItem && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Explore</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { href: '/events',    Icon: Trophy,       label: 'Browse Events' },
              { href: '/standings', Icon: BarChart3,    label: 'Standings'     },
              { href: '/my-events', Icon: Users,        label: 'My Events'     },
              { href: '/shop',      Icon: ShoppingBag,  label: 'Shop'          },
            ] as const).map(({ href, Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 bg-white border rounded-xl px-3 py-3.5 hover:shadow-sm transition-shadow group"
              >
                <Icon className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors" />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
