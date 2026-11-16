/**
 * Team intro + matchup cards for the TV showcase zone (source 'teams').
 *
 * Built from data every event already has — team name, colour, logo, roster,
 * pool and results — so the screen fills even when nobody has set up a
 * player card. Pure helpers here (tested); the loader is in actions/display.ts
 * and the slides in components/display/zones/team-slides.tsx.
 */

export type RosterNameStyle = 'full' | 'short'

/** "Samantha Lee-Wong" → "Samantha L." (short); one-word names stay as they are. */
export function displayName(fullName: string | null | undefined, style: RosterNameStyle): string {
  const name = (fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return 'Player'
  if (style === 'full') return name
  const parts = name.split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

export interface TeamCardPlayer {
  name: string
  number: string | null
  position: string | null
  role: 'captain' | 'player' | 'coach'
  /** Only for players who turned their card on (show_on_displays). */
  photoUrl: string | null
}

/** Captain first, then players by jersey number (numberless after), coaches last. */
export function sortRoster<T extends Pick<TeamCardPlayer, 'name' | 'number' | 'role'>>(roster: T[]): T[] {
  const rank = (p: T) => (p.role === 'captain' ? 0 : p.role === 'coach' ? 2 : 1)
  const num = (p: T) => {
    const n = p.number ? parseInt(p.number, 10) : NaN
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
  }
  return [...roster].sort((a, b) =>
    rank(a) - rank(b) || num(a) - num(b) || a.name.localeCompare(b.name))
}

/** "3–1", "3–1–1" with ties, null before the first result. */
export function recordLabel(r: { played: number; won: number; lost: number; drawn: number }): string | null {
  if (r.played <= 0) return null
  return r.drawn > 0 ? `${r.won}–${r.lost}–${r.drawn}` : `${r.won}–${r.lost}`
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/**
 * The strip under the team name: "POOL A · 2ND · 3–1". Standing only once
 * the team has played (a rank before any result is just list order).
 */
export function teamMetaLine(t: { poolName: string | null; rank: number | null; played: number; won: number; lost: number; drawn: number }): string[] {
  const bits: string[] = []
  if (t.poolName) bits.push(t.poolName)
  const record = recordLabel(t)
  if (record && t.rank) bits.push(`${ordinal(t.rank)}${t.poolName ? '' : ' overall'}`)
  if (record) bits.push(record)
  return bits
}

export interface MeetingResult {
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
  at: string
}

/**
 * "Last meeting: Spikers won 21–18" / "Last meeting: tied 20–20". The score
 * reads winner-first. Null when they haven't met or the score is missing.
 */
export function headToHeadLine(last: MeetingResult | null | undefined, nameOf: (teamId: string) => string): string | null {
  if (!last || last.homeScore == null || last.awayScore == null) return null
  const { homeScore: h, awayScore: a } = last
  if (h === a) return `Last meeting: tied ${h}–${a}`
  const winner = h > a ? last.homeTeamId : last.awayTeamId
  return `Last meeting: ${nameOf(winner)} won ${Math.max(h, a)}–${Math.min(h, a)}`
}

/** Key for a pair of teams, order-free. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Matchups air from 45 min before start until 5 min after. */
export const MATCHUP_LEAD_MS = 45 * 60 * 1000
export const MATCHUP_TAIL_MS = 5 * 60 * 1000

export function matchupIsCurrent(scheduledAt: string, nowMs: number): boolean {
  const t = new Date(scheduledAt).getTime()
  return t - nowMs <= MATCHUP_LEAD_MS && nowMs - t <= MATCHUP_TAIL_MS
}

/**
 * Slide order for the teams source: the games about to start first (one
 * matchup slide each), then every team's intro card, with event photos
 * dropped in after every second card.
 */
export function teamsPlaylist<M extends { scheduledAt: string }, T, P>(opts: {
  matchups: M[]
  teams: T[]
  photos: P[]
  nowMs: number
  shuffle?: <X>(xs: X[]) => X[]
}): Array<{ kind: 'matchup'; matchup: M } | { kind: 'team'; team: T } | { kind: 'photo'; photo: P }> {
  const mix = opts.shuffle ?? (<X,>(xs: X[]) => xs)
  const out: Array<{ kind: 'matchup'; matchup: M } | { kind: 'team'; team: T } | { kind: 'photo'; photo: P }> = []
  for (const m of opts.matchups) if (matchupIsCurrent(m.scheduledAt, opts.nowMs)) out.push({ kind: 'matchup', matchup: m })
  const teams = mix(opts.teams)
  const photos = mix(opts.photos)
  let pi = 0
  teams.forEach((team, i) => {
    out.push({ kind: 'team', team })
    if ((i + 1) % 2 === 0 && pi < photos.length) out.push({ kind: 'photo', photo: photos[pi++] })
  })
  // No teams (yet)? Still show the photos rather than an empty screen.
  if (teams.length === 0) for (const photo of photos) out.push({ kind: 'photo', photo })
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/
/** A stored team colour, or null when it isn't a plain #rrggbb. */
export function safeTeamColor(c: string | null | undefined): string | null {
  return c && HEX.test(c) ? c : null
}

const FALLBACK_TEAM_COLORS = ['#1d4ed8', '#b91c1c', '#047857', '#6d28d9', '#b45309', '#0e7490', '#be185d', '#374151']

/**
 * The colour a team's slide is painted in: its own colour, else a stable pick
 * keyed to the name (so a team keeps the same colour all tournament).
 */
export function teamColor(t: { name: string; color: string | null }): string {
  const own = safeTeamColor(t.color)
  if (own) return own
  let hash = 0
  for (const ch of t.name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_TEAM_COLORS[hash % FALLBACK_TEAM_COLORS.length]
}

/** First letter of up to two words: "Net Results" → "NR". */
export function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.slice(0, 2).map((w) => w.charAt(0)).join('') || '?').toUpperCase()
}
