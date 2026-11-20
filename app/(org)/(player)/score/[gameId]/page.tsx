import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { redirectToLogin } from '@/lib/auth'
import { getScoringRole } from '@/lib/score-permissions'
import { impersonationGrantsAdmin } from '@/lib/impersonation'
import { scoreScanTarget } from '@/lib/score-scan'

export const metadata = { title: 'Open game' }

/**
 * A printed score sheet's QR code — a game or a playoff bracket match. Opens
 * it where the person scanning can score it (see lib/score-scan.ts); signing
 * in first returns here.
 */
export default async function ScoreScanPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId: id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const db = createServiceRoleClient()
  const [{ data: game }, { data: match }, tz] = await Promise.all([
    db.from('games').select('id, league_id, scheduled_at')
      .eq('id', id).eq('organization_id', org.id).maybeSingle(),
    db.from('bracket_matches').select('id, scheduled_at, bracket:brackets!bracket_matches_bracket_id_fkey(league_id, league:leagues(slug))')
      .eq('id', id).eq('organization_id', org.id).maybeSingle(),
    getOrgTimezone(org.id),
  ])
  if (!game && !match) notFound()

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
  const bracket = match ? one((match as any).bracket) : null
  const leagueId: string | null = game ? game.league_id ?? null : bracket?.league_id ?? null
  const slug: string | null = one(bracket?.league)?.slug ?? null
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const scheduledAt = game ? game.scheduled_at : match?.scheduled_at ?? null

  const impersonating = impersonationGrantsAdmin(headersList.get('x-impersonating'), user)
  const role = await getScoringRole(db, org.id, user.id, leagueId, { impersonating })
  const date = scheduledAt ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(scheduledAt)) : null
  redirect(scoreScanTarget(role, id, date, game
    ? { publicPath: `/games/${id}` }
    : { publicPath: slug ? `/events/${slug}` : '/events', bracketAdminPath: leagueId ? `/admin/events/${leagueId}/bracket` : null }))
}
