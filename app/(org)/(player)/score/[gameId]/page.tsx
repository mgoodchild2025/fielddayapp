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
 * A printed score sheet's QR code. Opens that game where the person scanning
 * can score it (see lib/score-scan.ts); signing in first returns here.
 */
export default async function ScoreScanPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) notFound()
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const db = createServiceRoleClient()
  const [{ data: game }, tz] = await Promise.all([
    db.from('games').select('id, league_id, scheduled_at')
      .eq('id', gameId).eq('organization_id', org.id).maybeSingle(),
    getOrgTimezone(org.id),
  ])
  if (!game) notFound()

  const impersonating = impersonationGrantsAdmin(headersList.get('x-impersonating'), user)
  const role = await getScoringRole(db, org.id, user.id, game.league_id ?? null, { impersonating })
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(game.scheduled_at))
  redirect(scoreScanTarget(role, game.id, date))
}
