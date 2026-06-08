'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { upsertRsvp } from '@/actions/rsvp'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NextGame = {
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
  rsvpNoResponse: number
  myRsvp: 'in' | 'out' | null
}

export type RecentResult = {
  gameId: string
  scheduledAt: string
  opponentName: string
  homeScore: number
  awayScore: number
  isHome: boolean
  outcome: 'W' | 'L' | 'T'
}

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
  nextGame: NextGame | null
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
  type: 'waiver' | 'pending_registration'
  label: string
  sublabel: string
  href: string
}

interface Props {
  firstName: string
  timezone: string
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

function daysUntil(iso: string): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
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
  return new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

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

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient({ firstName, timezone, teams, pendingActions }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [rsvpStatus, setRsvpStatus] = useState<Record<string, 'in' | 'out' | null>>(
    Object.fromEntries(teams.map((t) => [t.teamId, t.nextGame?.myRsvp ?? null]))
  )
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, { in: number; out: number; noResponse: number }>>(
    Object.fromEntries(teams.map((t) => [t.teamId, {
      in: t.nextGame?.rsvpIn ?? 0,
      out: t.nextGame?.rsvpOut ?? 0,
      noResponse: t.nextGame?.rsvpNoResponse ?? 0,
    }]))
  )
  const [, startTransition] = useTransition()

  const team = teams[activeIdx]

  function handleRsvp(gameId: string, teamId: string, status: 'in' | 'out') {
    const prev = rsvpStatus[teamId]
    if (prev === status) return // no-op

    // Optimistic update
    setRsvpStatus((s) => ({ ...s, [teamId]: status }))
    setRsvpCounts((counts) => {
      const c = { ...counts[teamId] }
      // Remove old vote
      if (prev === 'in') c.in = Math.max(0, c.in - 1)
      else if (prev === 'out') c.out = Math.max(0, c.out - 1)
      else c.noResponse = Math.max(0, c.noResponse - 1)
      // Add new vote
      if (status === 'in') c.in++
      else c.out++
      return { ...counts, [teamId]: c }
    })

    startTransition(async () => {
      const result = await upsertRsvp(gameId, teamId, status)
      if (result.error) {
        // Roll back
        setRsvpStatus((s) => ({ ...s, [teamId]: prev }))
        setRsvpCounts((counts) => {
          const c = { ...counts[teamId] }
          if (status === 'in') c.in = Math.max(0, c.in - 1)
          else c.out = Math.max(0, c.out - 1)
          if (prev === 'in') c.in++
          else if (prev === 'out') c.out++
          else c.noResponse++
          return { ...counts, [teamId]: c }
        })
      }
    })
  }

  if (teams.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🏅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">You&apos;re not on any active teams yet</h2>
        <p className="text-gray-500 text-sm mb-6">Register for an event to get started.</p>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Browse Events →
        </Link>
      </div>
    )
  }

  const myRsvp = team ? (rsvpStatus[team.teamId] ?? null) : null
  const counts = team ? (rsvpCounts[team.teamId] ?? { in: 0, out: 0, noResponse: 0 }) : { in: 0, out: 0, noResponse: 0 }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-8">

      {/* ── Greeting ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{todayLabel()}</p>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {greeting()}, {firstName} 👋
        </h1>
      </div>

      {/* ── Action banners ── */}
      {pendingActions.map((action) => (
        <Link key={action.href} href={action.href} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 hover:bg-amber-100 transition-colors">
          <span className="text-xl shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">{action.label}</p>
            <p className="text-xs text-amber-700 mt-0.5">{action.sublabel}</p>
          </div>
          <span className="text-xs font-bold text-amber-700 shrink-0">Complete →</span>
        </Link>
      ))}

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

      {team && (
        <>
          {/* ── Next Game hero ── */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Next Game</h2>
              <Link href="/schedule" className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                Full schedule →
              </Link>
            </div>

            {team.nextGame ? (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                {/* Dark header bar */}
                <div className="flex items-center justify-between px-5 py-2.5" style={{ backgroundColor: 'var(--brand-secondary)' }}>
                  <span className="text-xs font-bold uppercase tracking-widest text-white/50">
                    {team.nextGame.weekNumber ? `Week ${team.nextGame.weekNumber}` : team.nextGame.leagueName}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">
                    {daysUntil(team.nextGame.scheduledAt)}
                  </span>
                </div>

                {/* Matchup */}
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-center justify-center gap-4">
                    {/* My team */}
                    <div className="flex-1 flex flex-col items-center gap-2 text-center max-w-[160px]">
                      <TeamCircle name={team.teamName} color={team.teamColor} logoUrl={team.teamLogoUrl} size={64} />
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{team.teamName}</p>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', color: 'var(--brand-primary)' }}>
                          You
                        </span>
                      </div>
                    </div>

                    <span className="text-lg font-bold text-gray-200 shrink-0 w-8 text-center">vs</span>

                    {/* Opponent */}
                    <div className="flex-1 flex flex-col items-center gap-2 text-center max-w-[160px]">
                      <TeamCircle
                        name={team.nextGame.opponentName}
                        color={team.nextGame.opponentColor}
                        logoUrl={team.nextGame.opponentLogoUrl}
                        size={64}
                      />
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{team.nextGame.opponentName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{team.nextGame.leagueName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Game meta */}
                  <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-semibold text-gray-900">{formatDate(team.nextGame.scheduledAt, timezone)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold text-gray-900">{formatTime(team.nextGame.scheduledAt, timezone)}</span>
                    </div>
                    {team.nextGame.court && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{team.nextGame.court}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* RSVP footer */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
                  {/* RSVP counts */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      {counts.in} in
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                      {counts.out} out
                    </div>
                    {counts.noResponse > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                        {counts.noResponse} TBD
                      </div>
                    )}
                  </div>

                  {/* RSVP buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRsvp(team.nextGame!.id, team.teamId, 'out')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        myRsvp === 'out'
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {myRsvp === 'out' ? '✗ Can\'t make it' : 'Can\'t make it'}
                    </button>
                    <button
                      onClick={() => handleRsvp(team.nextGame!.id, team.teamId, 'in')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        myRsvp === 'in'
                          ? 'text-white'
                          : 'text-white opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      {myRsvp === 'in' ? '✓ I\'m in' : 'I\'m in'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border p-10 text-center">
                <p className="text-3xl mb-3">📅</p>
                <p className="text-sm font-medium text-gray-500">No games scheduled yet</p>
                <p className="text-xs text-gray-400 mt-1">Check back soon — your next game will appear here.</p>
              </div>
            )}
          </section>

          {/* ── Season stats ── */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Season Stats · {team.teamName}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {/* Record */}
              <div className="bg-white rounded-xl border p-4">
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
              </div>

              {/* Standing */}
              <div className="bg-white rounded-xl border p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Standing</p>
                {team.record.standing !== null ? (
                  <>
                    <p className="text-2xl font-extrabold tracking-tight leading-none">
                      <span style={{ color: 'var(--brand-primary)' }}>{team.record.standing}{ordinal(team.record.standing)}</span>
                      {team.record.totalTeams !== null && (
                        <span className="text-sm font-semibold text-gray-400 ml-0.5"> / {team.record.totalTeams}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1.5 truncate">{team.leagueName}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">—</p>
                )}
              </div>

              {/* Points */}
              <div className="bg-white rounded-xl border p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Points</p>
                <p className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--brand-primary)' }}>
                  {team.record.points}
                </p>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {team.record.wins * 3 + team.record.ties} pts (3/1/0)
                </p>
              </div>
            </div>
          </section>

          {/* ── Two-column: Recent results + quick links ── */}
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
                          {r.isHome ? `${team.teamName} vs ${r.opponentName}` : `${r.opponentName} vs ${team.teamName}`}
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

            {/* My Team card */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">My Team</h2>
                {teams.length > 1 && (
                  <Link href="/my-teams" className="text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    All teams →
                  </Link>
                )}
              </div>

              <Link href={`/teams/${team.teamId}`} className="flex items-center gap-4 bg-white border rounded-xl px-4 py-4 hover:shadow-md transition-shadow group">
                <TeamCircle name={team.teamName} color={team.teamColor} logoUrl={team.teamLogoUrl} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{team.teamName}</p>
                    {team.role === 'captain' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)', color: 'var(--brand-primary)' }}>
                        Captain
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{team.leagueName}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              {/* Quick nav links below the team card */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  { href: '/events',    icon: '🏅', label: 'Browse Events' },
                  { href: '/standings', icon: '🏆', label: 'Standings'     },
                  { href: '/schedule',  icon: '📅', label: 'Schedule'      },
                  { href: '/shop',      icon: '🛍️', label: 'Shop'          },
                ].map(({ href, icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 bg-white border rounded-xl px-3 py-3 hover:shadow-sm transition-shadow group"
                  >
                    <span className="text-base shrink-0">{icon}</span>
                    <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
