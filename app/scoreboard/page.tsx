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
      id, status, home_team_id, away_team_id,
      home_team:teams!games_home_team_id_fkey(id, name, color),
      away_team:teams!games_away_team_id_fkey(id, name, color),
      league:leagues!games_league_id_fkey(id, name, sport),
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
    gameId: game.id,
    leagueId: league?.id ?? '',
    leagueName: league?.name ?? '',
    setSport: SET_SPORTS.has(league?.sport ?? ''),
    home: { name: home.name, color: home.color ?? null },
    away: { name: away.name, color: away.color ?? null },
    canSave,
    resultStatus: result?.status ?? null,
  }
}

export default async function ScoreboardPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams
  const attached = game && /^[0-9a-f-]{36}$/.test(game) ? await loadAttachedGame(game) : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <ScoreboardApp attached={attached} />
    </>
  )
}
