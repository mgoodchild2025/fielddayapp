import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { ScoreboardApp, type AttachedGame } from '@/components/scoreboard/scoreboard-app'

// Free standalone scoreboard — no login, works on every host (apex and org
// sites), installable as its own PWA, offline once visited. Canonical points
// at the apex so org-host copies never register as duplicate content.
//
// On an org host, ?game=<id> attaches the board to a real game: team names,
// colours, and scoring mode prefill, and captains/admins can save the result
// through the normal score pipeline (submitScore / adminSetScore).

export const metadata: Metadata = {
  title: 'Free Scoreboard App — Fieldday',
  description:
    'A free scoreboard for volleyball, basketball, and any court sport. Tap to score, swipe down to undo, set-by-set tracking. Works offline — add it to your home screen.',
  alternates: { canonical: 'https://fielddayapp.ca/scoreboard' },
  manifest: '/scoreboard/manifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Scoreboard' },
  // iOS ignores manifest icons — Add to Home Screen reads apple-touch-icon.
  icons: { apple: [{ url: '/scoreboard-icon-512.png', sizes: '512x512', type: 'image/png' }] },
  openGraph: {
    title: 'Free Scoreboard App — Fieldday',
    description: 'Tap to score, swipe down to undo, works offline. Free from Fieldday.',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B1210',
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Fieldday Scoreboard',
  url: 'https://fielddayapp.ca/scoreboard',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Any',
  description:
    'A free web scoreboard for volleyball, basketball, and any court sport. Tap to score, swipe down to undo, set-by-set tracking, works offline.',
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'CAD' },
  publisher: { '@type': 'Organization', name: 'Fieldday Sports Technology Inc.', url: 'https://fielddayapp.ca' },
}

const SET_SPORTS = new Set(['volleyball', 'beach_volleyball'])

async function loadAttachedGame(gameId: string): Promise<AttachedGame | null> {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')
  if (!orgId) return null

  const db = createServiceRoleClient()
  const { data: game } = await db
    .from('games')
    .select(`
      id, status, court, home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name, color),
      away_team:teams!games_away_team_id_fkey(id, name, color),
      league:leagues!games_league_id_fkey(id, name, sport, slug),
      game_results(home_score, away_score, status)
    `)
    .eq('id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!game) return null
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const home = (Array.isArray(game.home_team) ? game.home_team[0] : game.home_team) as any
  const away = (Array.isArray(game.away_team) ? game.away_team[0] : game.away_team) as any
  const league = (Array.isArray(game.league) ? game.league[0] : game.league) as any
  const result = (Array.isArray(game.game_results) ? game.game_results[0] : game.game_results) as any
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!home || !away) return null // TBD matchups can't be scored

  // Who is looking? Admins save confirmed; captains of either team submit
  // (pending → opponent confirms); everyone else gets a score-only board.
  let canSave: 'admin' | 'captain' | null = null
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const [{ data: adminRow }, { data: captainRow }] = await Promise.all([
      db.from('org_members').select('role').eq('organization_id', orgId).eq('user_id', user.id)
        .in('role', ['org_admin', 'league_admin']).maybeSingle(),
      db.from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'captain')
        .eq('status', 'active').in('team_id', [home.id, away.id]).limit(1).maybeSingle(),
    ])
    if (adminRow) canSave = 'admin'
    else if (captainRow) canSave = 'captain'
  }

  return {
    kind: 'game',
    gameId: game.id,
    bracketId: null,
    leagueId: league?.id ?? '',
    leagueSlug: league?.slug ?? '',
    leagueName: league?.name ?? '',
    court: game.court ?? null,
    setSport: SET_SPORTS.has(league?.sport ?? ''),
    home: { name: home.name, color: home.color ?? null },
    away: { name: away.name, color: away.color ?? null },
    canSave,
    resultStatus: result?.status ?? null,
  }
}

// Playoff bracket matches aren't games rows — they live in bracket_matches with
// their own score entry (recordBracketScore, admin-only, auto-advances the
// winner). ?match=<id> attaches the board to one of those.
async function loadAttachedBracketMatch(matchId: string): Promise<AttachedGame | null> {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')
  if (!orgId) return null

  const db = createServiceRoleClient()
  const { data: match } = await db
    .from('bracket_matches')
    .select(`
      id, status, court, bracket_id,
      team1:teams!bracket_matches_team1_id_fkey(id, name, color),
      team2:teams!bracket_matches_team2_id_fkey(id, name, color),
      bracket:brackets!bracket_matches_bracket_id_fkey(id, name, league_id)
    `)
    .eq('id', matchId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!match) return null
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const team1 = (Array.isArray(match.team1) ? match.team1[0] : match.team1) as any
  const team2 = (Array.isArray(match.team2) ? match.team2[0] : match.team2) as any
  const bracket = (Array.isArray(match.bracket) ? match.bracket[0] : match.bracket) as any
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!team1 || !team2 || !bracket) return null // undetermined matchups can't be scored

  const { data: league } = await db
    .from('leagues')
    .select('id, name, sport, slug')
    .eq('id', bracket.league_id)
    .maybeSingle()
  if (!league) return null

  // Bracket scores are admin-entered only (recordBracketScore advances the
  // winner) — captains and spectators get a score-only board.
  let canSave: 'admin' | null = null
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: adminRow } = await db
      .from('org_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .in('role', ['org_admin', 'league_admin'])
      .maybeSingle()
    if (adminRow) canSave = 'admin'
  }

  return {
    kind: 'bracket',
    gameId: match.id,
    bracketId: bracket.id,
    leagueId: league.id,
    leagueSlug: league.slug ?? '',
    leagueName: `${league.name} · ${bracket.name}`,
    court: match.court ?? null,
    setSport: SET_SPORTS.has(league.sport ?? ''),
    home: { name: team1.name, color: team1.color ?? null },
    away: { name: team2.name, color: team2.color ?? null },
    canSave,
    resultStatus: match.status === 'completed' ? 'confirmed' : null,
  }
}

export default async function ScoreboardPage({ searchParams }: { searchParams: Promise<{ game?: string; match?: string }> }) {
  const { game, match } = await searchParams
  const isUuid = (v?: string): v is string => !!v && /^[0-9a-f-]{36}$/.test(v)
  const attached = isUuid(match)
    ? await loadAttachedBracketMatch(match)
    : isUuid(game)
    ? await loadAttachedGame(game)
    : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <ScoreboardApp attached={attached} />
    </>
  )
}
