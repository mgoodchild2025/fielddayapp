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
  // Work in UTF-8 bytes for accurate octet count
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
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse('Missing token', { status: 400 })
  }

  const db = createServiceRoleClient()

  // Validate token against team ─────────────────────────────────────────────
  const { data: team, error: teamErr } = await db
    .from('teams')
    .select('id, name, calendar_token, league_id, league:leagues!teams_league_id_fkey(name, slug, venue_name, venue_address)')
    .eq('id', teamId)
    .eq('calendar_token', token)
    .single()

  if (teamErr || !team) {
    return new NextResponse('Not found', { status: 404 })
  }

  const league = Array.isArray(team.league) ? team.league[0] : team.league
  const leagueName = (league as { name?: string } | null)?.name ?? ''
  const leagueSlug = (league as { slug?: string } | null)?.slug ?? ''
  const venueAddress = (league as { venue_address?: string | null } | null)?.venue_address ?? ''

  // Fetch games (past 90 days → future, no upper limit) ─────────────────────
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: games } = await db
    .from('games')
    .select(`
      id, scheduled_at, court, week_number, status,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name)
    `)
    .eq('league_id', team.league_id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte('scheduled_at', since)
    .order('scheduled_at', { ascending: true })

  // Build host for description links ────────────────────────────────────────
  const host = request.headers.get('host') ?? request.nextUrl.host
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const teamUrl = `${protocol}://${host}/teams/${teamId}`
  const CRLF = '\r\n'
  const now = icalDate(new Date())

  // Build VCALENDAR ─────────────────────────────────────────────────────────
  const lines: string[] = [
    prop('BEGIN', 'VCALENDAR'),
    prop('VERSION', '2.0'),
    prop('PRODID', '-//Fieldday//Team Schedule//EN'),
    prop('CALSCALE', 'GREGORIAN'),
    prop('METHOD', 'PUBLISH'),
    prop('X-WR-CALNAME', escapeText(`${team.name} Schedule`)),
    prop('X-WR-TIMEZONE', 'UTC'),
    prop('REFRESH-INTERVAL;VALUE=DURATION', 'PT5M'),
    prop('X-PUBLISHED-TTL', 'PT5M'),
  ]

  for (const g of games ?? []) {
    const homeTeam = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
    const awayTeam = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
    const homeName = (homeTeam as { name?: string } | null)?.name ?? 'TBD'
    const awayName = (awayTeam as { name?: string } | null)?.name ?? 'TBD'

    const start = new Date(g.scheduled_at)
    const end = new Date(start.getTime() + 60 * 60 * 1000) // default 60 min

    // LOCATION: "Court N · Venue Address" — omit empty parts
    const locationParts: string[] = []
    if (g.court) locationParts.push(`Court ${g.court}`)
    if (venueAddress) locationParts.push(venueAddress)
    const location = locationParts.join(' · ')

    // DESCRIPTION: "Week N · League Name\n\nView team: URL"
    const descParts: string[] = []
    if (g.week_number != null) descParts.push(`Week ${g.week_number}`)
    if (leagueName) descParts.push(leagueName)
    const description = [descParts.join(' · '), `View team: ${teamUrl}`]
      .filter(Boolean)
      .join('\\n\\n')

    // STATUS
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

  // Add subscription link event if no games (keeps feed non-empty for troubleshooting)
  if (!games || games.length === 0) {
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    lines.push(
      prop('BEGIN', 'VEVENT'),
      prop('UID', `no-games-${teamId}@fieldday.app`),
      prop('DTSTAMP', now),
      prop('DTSTART', icalDate(start)),
      prop('DTEND', icalDate(end)),
      prop('SUMMARY', escapeText(`${team.name} — No upcoming games`)),
      prop('DESCRIPTION', escapeText(`View team: ${teamUrl}`)),
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
      'Content-Disposition': 'attachment; filename="schedule.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
