import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { MarketingPage } from '@/components/marketing/marketing-page'
import { CommunityHome } from '@/components/site-themes/community/community-home'
import { ClubHome } from '@/components/site-themes/club/club-home'
import { ProHome } from '@/components/site-themes/pro/pro-home'

async function OrgHomePage({ orgId }: { orgId: string }) {
  const supabase = await createServerClient()

  const [{ data: org }, { data: branding }, { data: leagues }, { data: siteContent }, { data: photos }, { data: sponsors }, { data: recentResultsRaw }] = await Promise.all([
    supabase.from('organizations').select('id, slug, name').eq('id', orgId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('org_branding')
      .select('tagline, hero_image_url, logo_url, site_theme')
      .eq('organization_id', orgId)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('leagues')
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_photos')
      .select('id, url, caption, display_order')
      .eq('organization_id', orgId)
      .order('display_order', { ascending: true })
      .limit(24),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_sponsors')
      .select('id, name, logo_url, website_url, tier, display_order')
      .eq('organization_id', orgId)
      .order('display_order'),
    // Recent confirmed results for Pro theme
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('game_results')
      .select(`
        id, home_score, away_score,
        game:games!game_results_game_id_fkey(
          scheduled_at, organization_id,
          home_team:teams!games_home_team_id_fkey(name),
          away_team:teams!games_away_team_id_fkey(name),
          leagues(name)
        )
      `)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  if (!org) return <MarketingPage />

  // Build a content map keyed by section_key
  const contentMap = new Map<string, Record<string, unknown>>(
    (siteContent ?? []).map((r: { section_key: string; content: Record<string, unknown> }) => [r.section_key, r.content])
  )
  const heroContent = (contentMap.get('hero') ?? {}) as {
    headline?: string; subheadline?: string; cta_label?: string; cta_href?: string
  }
  const aboutContent = (contentMap.get('about') ?? {}) as { title?: string; body?: string }

  const orgContext = { id: org.id, slug: org.slug, name: org.name }
  const theme = (branding as unknown as { site_theme?: string })?.site_theme ?? 'community'

  type League = {
    id: string; name: string; slug: string; event_type: string | null; status: string
    season_start_date: string | null; price_cents: number; currency: string | null
    max_teams: number | null; payment_mode: string | null; skill_level: string | null
    days_of_week: string[] | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueList = ((leagues ?? []) as any[]) as League[]

  const openEvents = leagueList.filter((l) => l.status === 'registration_open')
  const inSeasonEvents = leagueList.filter((l) => l.status === 'active')
  const completedEvents = leagueList.filter((l) => l.status === 'completed')

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

  // Process recent results for Pro theme (field names match ProHome's RecentResult type)
  const recentResults = (recentResultsRaw ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => r.game?.organization_id === orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      id: r.id as string,
      home_score: r.home_score as number | null,
      away_score: r.away_score as number | null,
      scheduled_at: (r.game?.scheduled_at ?? '') as string,
      league_name: (r.game?.leagues?.name ?? null) as string | null,
      home_team_name: (r.game?.home_team?.name ?? 'TBD') as string,
      away_team_name: (r.game?.away_team?.name ?? 'TBD') as string,
    }))

  type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null; tier: string; display_order: number }
  const sponsorList = (sponsors ?? []) as Sponsor[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = branding as any
  const brandingProps = b
    ? { tagline: b.tagline as string | null, hero_image_url: b.hero_image_url as string | null, logo_url: b.logo_url as string | null }
    : null
  const photoList = (photos ?? []) as { id: string; url: string; caption: string | null; display_order: number }[]

  switch (theme) {
    case 'club':
      return (
        <ClubHome
          org={orgContext}
          branding={brandingProps}
          heroContent={heroContent}
          aboutContent={aboutContent}
          sponsors={sponsorList}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          teamCountMap={teamCountMap}
        />
      )
    case 'pro':
      return (
        <ProHome
          org={orgContext}
          branding={brandingProps}
          heroContent={heroContent}
          sponsors={sponsorList}
          recentResults={recentResults}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          teamCountMap={teamCountMap}
        />
      )
    default:
      return (
        <CommunityHome
          org={orgContext}
          branding={brandingProps}
          heroContent={heroContent}
          aboutContent={aboutContent}
          photos={photoList}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          completedEvents={completedEvents}
          teamCountMap={teamCountMap}
        />
      )
  }
}

export default async function RootPage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return <MarketingPage />
  return <OrgHomePage orgId={orgId} />
}
