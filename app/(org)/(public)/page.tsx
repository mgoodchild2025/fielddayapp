import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { MarketingPage } from '@/components/marketing/marketing-page'
import { CommunityHome } from '@/components/site-themes/community/community-home'

async function OrgHomePage({ orgId }: { orgId: string }) {
  const supabase = await createServerClient()

  const [{ data: org }, { data: branding }, { data: leagues }, { data: siteContent }] = await Promise.all([
    supabase.from('organizations').select('id, slug, name').eq('id', orgId).single(),
    supabase.from('org_branding')
      .select('tagline, hero_image_url, logo_url, site_theme')
      .eq('organization_id', orgId)
      .single(),
    supabase.from('leagues')
      .select('id, name, slug, event_type, status, season_start_date, price_cents, currency, max_teams, payment_mode, skill_level, days_of_week')
      .eq('organization_id', orgId)
      .neq('status', 'draft')
      .neq('status', 'archived')
      .order('season_start_date', { ascending: true })
      .limit(50),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_site_content')
      .select('section_key, content')
      .eq('organization_id', orgId),
  ])

  if (!org) return <MarketingPage />

  // Build a content map keyed by section_key
  const contentMap = new Map<string, Record<string, unknown>>(
    (siteContent ?? []).map((r: { section_key: string; content: Record<string, unknown> }) => [r.section_key, r.content])
  )
  const heroContent = (contentMap.get('hero') ?? {}) as {
    headline?: string; subheadline?: string; cta_label?: string; cta_href?: string
  }

  const orgContext = { id: org.id, slug: org.slug, name: org.name }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const theme = (branding as any)?.site_theme ?? 'community'

  const openEvents = (leagues ?? []).filter((l) => l.status === 'registration_open')
  const inSeasonEvents = (leagues ?? []).filter((l) => l.status === 'active')
  const completedEvents = (leagues ?? []).filter((l) => l.status === 'completed')

  // Fetch team counts for per-team open events
  const perTeamOpenIds = openEvents
    .filter((l) => l.payment_mode === 'per_team')
    .map((l) => l.id)

  const teamCountMap = new Map<string, number>()
  if (perTeamOpenIds.length > 0) {
    const { data: teamRows } = await supabase
      .from('teams')
      .select('league_id')
      .in('league_id', perTeamOpenIds)
      .eq('status', 'active')
    for (const t of teamRows ?? []) {
      teamCountMap.set(t.league_id, (teamCountMap.get(t.league_id) ?? 0) + 1)
    }
  }

  const sharedProps = {
    org: orgContext,
    branding: branding
      ? { tagline: branding.tagline, hero_image_url: branding.hero_image_url, logo_url: branding.logo_url }
      : null,
    heroContent,
    openEvents,
    inSeasonEvents,
    completedEvents,
    teamCountMap,
  }

  // Route to the correct theme — Club and Pro will be added in Phase 2/3
  switch (theme) {
    case 'club':
    case 'pro':
    // fall through until those themes are built
    default:
      return <CommunityHome {...sharedProps} />
  }
}

export default async function RootPage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return <MarketingPage />
  return <OrgHomePage orgId={orgId} />
}
