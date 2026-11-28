import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { loadResultForTeam } from '@/lib/game-result-alerts'
import { ResultCardImage } from '@/components/games/result-card-image'
import { ogFonts } from '@/lib/og-fonts'
import { formatGameTime } from '@/lib/format-time'

/**
 * The shareable result card: a 1080×1350 (Instagram portrait) PNG of a
 * player's result, from THEIR team's side. Only for a signed-in player on one
 * of the two teams (nobody else's result card is drawn), and only once the
 * result is confirmed. The page fetches it and hands it to the share sheet,
 * so it never needs a public URL. Satori-safe styling: flexbox only.
 */
export const runtime = 'nodejs'

const HEX = /^#[0-9a-f]{6}$/i
const safe = (c: string | null | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback)

export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return new Response('Not found', { status: 404 })
  const org = await getCurrentOrg(await headers())
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Sign in first', { status: 401 })

  const db = createServiceRoleClient()
  const [{ data: game }, { data: branding }] = await Promise.all([
    db.from('games').select('home_team_id, away_team_id').eq('id', gameId).eq('organization_id', org.id).maybeSingle(),
    db.from('org_branding').select('primary_color, timezone').eq('organization_id', org.id).maybeSingle(),
  ])
  if (!game) return new Response('Not found', { status: 404 })
  const teamIds = [game.home_team_id, game.away_team_id].filter((t): t is string => !!t)
  const { data: mine } = teamIds.length > 0
    ? await db.from('team_members').select('team_id').eq('user_id', user.id).eq('status', 'active').in('team_id', teamIds).limit(1)
    : { data: [] as { team_id: string }[] }
  const myTeamId = mine?.[0]?.team_id
  if (!myTeamId) return new Response('Not found', { status: 404 })

  const r = await loadResultForTeam(db, org.id, gameId, myTeamId)
  if (!r) return new Response('No result yet', { status: 404 })

  const accent = safe(branding?.primary_color, '#2563eb')
  const myColor = safe(r.myTeam.color, accent)
  const theirColor = safe(r.opponent.color, '#6b7280')
  const when = r.scheduledAt ? formatGameTime(r.scheduledAt, branding?.timezone ?? 'America/Toronto') : null

  return new ImageResponse(
    <ResultCardImage r={r} orgName={org.name} accent={accent} myColor={myColor} theirColor={theirColor} when={when} />,
    {
      width: 1080,
      height: 1350,
      fonts: await ogFonts(),
      headers: { 'Cache-Control': 'private, no-store' },
    },
  )
}
