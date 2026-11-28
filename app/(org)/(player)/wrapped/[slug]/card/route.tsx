import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { loadSeasonWrapped } from '@/lib/season-wrapped-load'
import { WrappedStoryImage } from '@/components/wrapped/wrapped-story-image'
import { ogFonts } from '@/lib/og-fonts'

/**
 * The signed-in player's Season Wrapped as a story image. Only ever their own
 * season (the user comes from the session, never the URL); private, not cached.
 */
export const runtime = 'nodejs'

const HEX = /^#[0-9a-f]{6}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return new Response('Not found', { status: 404 })
  const org = await getCurrentOrg(await headers())
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Sign in first', { status: 401 })

  const db = createServiceRoleClient()
  const [view, { data: branding }] = await Promise.all([
    loadSeasonWrapped(db, org.id, slug, user.id),
    db.from('org_branding').select('primary_color').eq('organization_id', org.id).maybeSingle(),
  ])
  if (!view) return new Response('Not found', { status: 404 })

  const accent = branding?.primary_color && HEX.test(branding.primary_color) ? branding.primary_color : '#2563eb'
  const teamColor = view.team?.color && HEX.test(view.team.color) ? view.team.color : accent

  return new ImageResponse(
    <WrappedStoryImage view={view} orgName={org.name} accent={accent} teamColor={teamColor} />,
    { width: 1080, height: 1920, fonts: await ogFonts(), headers: { 'Cache-Control': 'private, no-store' } },
  )
}
