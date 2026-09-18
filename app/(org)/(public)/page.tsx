import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { MarketingPage } from '@/components/marketing/marketing-page'
import { CommunityHome } from '@/components/site-themes/community/community-home'
import { ClubHome } from '@/components/site-themes/club/club-home'
import { ProHome } from '@/components/site-themes/pro/pro-home'
import { getEventSpotsMap } from '@/lib/event-spots'

async function OrgHomePage({ orgId }: { orgId: string }) {
  const db = createServiceRoleClient()


  const [{ data: org }, { data: branding }, { data: leagues }, { data: siteContent }, { data: photos }, { data: sponsors }, { data: staff }, { data: recentResultsRaw }] = await Promise.all([

    db.from('organizations').select('id, slug, name').eq('id', orgId).single(),

    db.from('org_branding')
      .select('tagline, hero_image_url, logo_url, site_theme, contact_email, timezone, social_instagram, social_facebook, social_x, social_tiktok, social_youtube')
      .eq('organization_id', orgId)
      .single(),

    // select('*') (not a named column list) so this still works before migration
    // 168 adds advertised/featured/teaser_text — the columns are simply absent.
    db.from('leagues')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'archived')
      .order('season_start_date', { ascending: true })
      .limit(50),

    db
      .from('org_site_content')
      .select('section_key, content')
      .eq('organization_id', orgId),

    db
      .from('org_photos')
      .select('id, url, caption, display_order')
      .eq('organization_id', orgId)
      .eq('featured', true)
      .order('display_order', { ascending: true }),

    db
      .from('org_sponsors')
      .select('id, name, logo_url, website_url, tier, display_order')
      .eq('organization_id', orgId)
      .order('display_order'),
    // Staff for public "Meet the Team" sections

    db
      .from('org_staff')
      .select('id, name, role, bio, avatar_url, display_order')
      .eq('organization_id', orgId)
      .order('display_order'),
    // Recent confirmed results for Pro theme.
    // Queried from `games` so the list can be ordered by when the game was
    // PLAYED — game_results has no created_at (the old ordering errored with
    // 42703 on every homepage load, so this section was always empty), and
    // ordering by when a score was entered floats backfilled results to the top.
    db
      .from('games')
      .select(`
        scheduled_at,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        leagues(name),
        game_results!inner(id, home_score, away_score, status)
      `)
      .eq('organization_id', orgId)
      .eq('game_results.status', 'confirmed')
      .order('scheduled_at', { ascending: false })
      .limit(8),
  ])

  if (!org) return <MarketingPage />

  // Build a content map keyed by section_key
  const contentMap = new Map<string, Record<string, unknown>>(
    (siteContent ?? []).map((r) => [r.section_key, (r.content ?? {}) as Record<string, unknown>])
  )
  const heroContent = (contentMap.get('hero') ?? {}) as {
    headline?: string; subheadline?: string; cta_label?: string; cta_href?: string
  }
  const aboutContent = (contentMap.get('about') ?? {}) as { title?: string; body?: string }
  const sectionLayout = ((contentMap.get('section_layout') ?? {}) as { sections?: { key: string; visible: boolean }[] }).sections ?? null

  const orgContext = { id: org.id, slug: org.slug, name: org.name }
  const theme = (branding as unknown as { site_theme?: string })?.site_theme ?? 'community'
  const timezone = (branding as unknown as { timezone?: string })?.timezone ?? 'America/Toronto'

  type League = {
    id: string; name: string; slug: string; event_type: string | null; status: string
    sport: string | null; logo_url: string | null
    season_start_date: string | null; price_cents: number; drop_in_price_cents: number | null; currency: string | null
    max_teams: number | null; max_participants: number | null; payment_mode: string | null; skill_level: string | null
    days_of_week: string[] | null
    game_start_time: string | null
    game_end_time: string | null
    advertised?: boolean | null
    featured?: boolean | null
    registration_opens_at?: string | null
    teaser_text?: string | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueList = ((leagues ?? []) as any[]) as League[]

  // Coming-soon: advertised draft events whose registration hasn't opened yet.

  const { data: comingSoonRaw } = await db.from('leagues')
    .select('id, name, slug, event_type, sport, logo_url, status, season_start_date, price_cents, drop_in_price_cents, currency, max_teams, max_participants, payment_mode, skill_level, days_of_week, game_start_time, game_end_time, advertised, featured, registration_opens_at, teaser_text')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'draft')
    .eq('advertised', true)
    .order('registration_opens_at', { ascending: true })
    .limit(20)
  const nowMs = Date.now()
  const upcomingEvents = (((comingSoonRaw ?? []) as any[]) as League[])
    .filter((l) => !l.registration_opens_at || new Date(l.registration_opens_at).getTime() > nowMs)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))

  // Featured open events bubble to the top of the "open" section.
  const openEvents = leagueList
    .filter((l) => l.status === 'registration_open')
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
  const inSeasonEvents = leagueList.filter((l) => l.status === 'active')
  const completedEvents = leagueList.filter((l) => l.status === 'completed')

  // Unified spots map — consumed by all theme components (shared with /events)
  const spotsMap = await getEventSpotsMap(db, openEvents)

  // Process recent results for Pro theme (field names match ProHome's RecentResult type)
  const recentResults = (recentResultsRaw ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any) => {
      const result = Array.isArray(g.game_results) ? g.game_results[0] : g.game_results
      const league = Array.isArray(g.leagues) ? g.leagues[0] : g.leagues
      const home = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const away = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
      return {
        id: result?.id as string,
        home_score: (result?.home_score ?? null) as number | null,
        away_score: (result?.away_score ?? null) as number | null,
        scheduled_at: (g.scheduled_at ?? '') as string,
        league_name: (league?.name ?? null) as string | null,
        home_team_name: (home?.name ?? 'TBD') as string,
        away_team_name: (away?.name ?? 'TBD') as string,
      }
    })
    .filter((r: { id: string }) => !!r.id)

  type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null; tier: string; display_order: number }
  type StaffMember = { id: string; name: string; role: string | null; bio: string | null; avatar_url: string | null; display_order: number }
  const sponsorList = (sponsors ?? []) as Sponsor[]
  const staffList = (staff ?? []) as StaffMember[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = branding as any
  const brandingProps = b
    ? {
        tagline: b.tagline as string | null,
        hero_image_url: b.hero_image_url as string | null,
        logo_url: b.logo_url as string | null,
        contact_email: b.contact_email as string | null,
        social_instagram: b.social_instagram as string | null,
        social_facebook: b.social_facebook as string | null,
        social_x: b.social_x as string | null,
        social_tiktok: b.social_tiktok as string | null,
        social_youtube: b.social_youtube as string | null,
      }
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
          staff={staffList}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          upcomingEvents={upcomingEvents}
          timezone={timezone}
          spotsMap={spotsMap}
          sectionLayout={sectionLayout}
        />
      )
    case 'pro':
      return (
        <ProHome
          org={orgContext}
          branding={brandingProps}
          heroContent={heroContent}
          sponsors={sponsorList}
          staff={staffList}
          recentResults={recentResults}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          upcomingEvents={upcomingEvents}
          timezone={timezone}
          spotsMap={spotsMap}
          sectionLayout={sectionLayout}
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
          staff={staffList}
          openEvents={openEvents}
          inSeasonEvents={inSeasonEvents}
          upcomingEvents={upcomingEvents}
          completedEvents={completedEvents}
          timezone={timezone}
          spotsMap={spotsMap}
          sectionLayout={sectionLayout}
        />
      )
  }
}

// Canonical URL for the marketing page only — org home pages must never point
// at the apex, or Google would treat every org site as a duplicate of it.
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return { alternates: { canonical: 'https://fielddayapp.ca' } }
  return {}
}

export default async function RootPage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) return <MarketingPage />
  return <OrgHomePage orgId={orgId} />
}
