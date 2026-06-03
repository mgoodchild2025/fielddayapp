import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

// RFC 5545 helpers ────────────────────────────────────────────────────────────

/** Escape text-value special chars per RFC 5545 §3.3.11 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

/** Format a Date as UTC iCal datetime string (YYYYMMDDTHHMMSSZ) */
function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fold a single content line to max 75 octets per RFC 5545 §3.1 (CRLF + space continuation) */
function foldLine(line: string): string {
  const CRLF = '\r\n'
  const encoder = new TextEncoder()
  let result = ''
  let current = ''
  for (const char of line) {
    const candidate = current + char
    if (encoder.encode(candidate).length > 75) {
      result += current + CRLF + ' '
      current = char
    } else {
      current = candidate
    }
  }
  result += current
  return result
}

/** Build a full iCal content line, folded */
function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`)
}

// Route handler ───────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse('Missing token', { status: 400 })
  }

  const db = createServiceRoleClient()

  // Validate token against the event (league) ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league, error: leagueErr } = await (db as any)
    .from('leagues')
    .select('id, name, slug, calendar_token, venue_name, venue_address')
    .eq('slug', slug)
    .eq('calendar_token', token)
    .single()

  if (leagueErr || !league) {
    return new NextResponse('Not found', { status: 404 })
  }

  const venueName = (league.venue_name as string | null) ?? ''
  const venueAddress = (league.venue_address as string | null) ?? ''

  // Fetch the event's sessions (past 90 days → future) and any games ──────────
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: sessions }, { data: games }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select('id, scheduled_at, duration_minutes, location_override, notes, status')
      .eq('league_id', league.id)
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('games')
      .select(`
        id, scheduled_at, court, week_number, status,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name)
      `)
      .eq('league_id', league.id)
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: true }),
  ])

  // Build host for description links ──────────────────────────────────────────
  const host = request.headers.get('host') ?? request.nextUrl.host
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const eventUrl = `${protocol}://${host}/events/${league.slug}`
  const CRLF = '\r\n'
  const now = icalDate(new Date())

  const lines: string[] = [
    prop('BEGIN', 'VCALENDAR'),
    prop('VERSION', '2.0'),
    prop('PRODID', '-//Fieldday//Event Schedule//EN'),
    prop('CALSCALE', 'GREGORIAN'),
    prop('METHOD', 'PUBLISH'),
    prop('X-WR-CALNAME', escapeText(`${league.name} Schedule`)),
    prop('X-WR-TIMEZONE', 'UTC'),
    prop('REFRESH-INTERVAL;VALUE=DURATION', 'PT5M'),
    prop('X-PUBLISHED-TTL', 'PT5M'),
  ]

  // Session VEVENTs ───────────────────────────────────────────────────────────
  for (const s of sessions ?? []) {
    const start = new Date(s.scheduled_at)
    const durationMin = typeof s.duration_minutes === 'number' ? s.duration_minutes : 90
    const end = new Date(start.getTime() + durationMin * 60 * 1000)

    const locationParts: string[] = []
    if (s.location_override) locationParts.push(s.location_override)
    else {
      if (venueName) locationParts.push(venueName)
      if (venueAddress) locationParts.push(venueAddress)
    }
    const location = locationParts.join(' · ')

    const description = [s.notes ? String(s.notes) : '', `View event: ${eventUrl}`]
      .filter(Boolean)
      .map((p) => escapeText(p))
      .join('\\n\\n')

    const icalStatus = s.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'

    lines.push(
      prop('BEGIN', 'VEVENT'),
      prop('UID', `session-${s.id}@fieldday.app`),
      prop('DTSTAMP', now),
      prop('DTSTART', icalDate(start)),
      prop('DTEND', icalDate(end)),
      prop('SUMMARY', escapeText(league.name)),
      ...(location ? [prop('LOCATION', escapeText(location))] : []),
      prop('DESCRIPTION', description),
      prop('STATUS', icalStatus),
      prop('SEQUENCE', '0'),
      prop('END', 'VEVENT'),
    )
  }

  // Game VEVENTs (for team/tournament events that also subscribe) ──────────────
  for (const g of games ?? []) {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    const homeName = (homeTeam as { name?: string } | null)?.name ?? 'TBD'
    const awayName = (awayTeam as { name?: string } | null)?.name ?? 'TBD'

    const start = new Date(g.scheduled_at)
    const end = new Date(start.getTime() + 60 * 60 * 1000)

    const locationParts: string[] = []
    if (g.court) locationParts.push(`Court ${g.court}`)
    if (venueAddress) locationParts.push(venueAddress)
    const location = locationParts.join(' · ')

    const descParts: string[] = []
    if (g.week_number != null) descParts.push(`Week ${g.week_number}`)
    const description = [descParts.join(' · '), `View event: ${eventUrl}`]
      .filter(Boolean)
      .join('\\n\\n')

    const icalStatus =
      g.status === 'cancelled' || g.status === 'postponed' ? 'CANCELLED' : 'CONFIRMED'

    lines.push(
      prop('BEGIN', 'VEVENT'),
      prop('UID', `game-${g.id}@fieldday.app`),
      prop('DTSTAMP', now),
      prop('DTSTART', icalDate(start)),
      prop('DTEND', icalDate(end)),
      prop('SUMMARY', escapeText(`${homeName} vs ${awayName}`)),
      ...(location ? [prop('LOCATION', escapeText(location))] : []),
      prop('DESCRIPTION', description),
      prop('STATUS', icalStatus),
      prop('SEQUENCE', '0'),
      prop('END', 'VEVENT'),
    )
  }

  // Keep the feed non-empty so calendar apps don't reject it
  if ((sessions?.length ?? 0) === 0 && (games?.length ?? 0) === 0) {
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    lines.push(
      prop('BEGIN', 'VEVENT'),
      prop('UID', `no-sessions-${league.id}@fieldday.app`),
      prop('DTSTAMP', now),
      prop('DTSTART', icalDate(start)),
      prop('DTEND', icalDate(end)),
      prop('SUMMARY', escapeText(`${league.name} — No sessions scheduled yet`)),
      prop('DESCRIPTION', escapeText(`View event: ${eventUrl}`)),
      prop('STATUS', 'CONFIRMED'),
      prop('SEQUENCE', '0'),
      prop('END', 'VEVENT'),
    )
  }

  lines.push(prop('END', 'VCALENDAR'))

  const body = lines.join(CRLF) + CRLF

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event-schedule.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
