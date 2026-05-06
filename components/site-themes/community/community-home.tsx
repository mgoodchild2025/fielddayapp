import Image from 'next/image'
import Link from 'next/link'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import type { OrgContext } from '@/lib/tenant'

type Photo = { id: string; url: string; caption: string | null; display_order: number }
type StaffMember = { id: string; name: string; role: string | null; bio: string | null; avatar_url: string | null; display_order: number }

type League = {
  id: string
  name: string
  slug: string
  event_type: string | null
  status: string
  season_start_date: string | null
  price_cents: number
  currency: string | null
  max_teams: number | null
  payment_mode: string | null
  skill_level: string | null
  days_of_week: string[] | null
}

type HeroContent = {
  headline?: string
  subheadline?: string
  cta_label?: string
  cta_href?: string
}

type AboutContent = {
  title?: string
  body?: string
}

interface Branding {
  tagline: string | null
  hero_image_url: string | null
  logo_url: string | null
  contact_email?: string | null
  social_instagram?: string | null
  social_facebook?: string | null
  social_x?: string | null
  social_tiktok?: string | null
}

const DEFAULT_SECTION_ORDER = ['events', 'about', 'staff', 'photos']

interface CommunityHomeProps {
  org: OrgContext & { name: string; slug: string }
  branding: Branding | null
  heroContent: HeroContent
  aboutContent: AboutContent
  photos: Photo[]
  staff: StaffMember[]
  openEvents: League[]
  inSeasonEvents: League[]
  completedEvents: League[]
  teamCountMap: Map<string, number>
  sectionLayout: { key: string; visible: boolean }[] | null
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  league: 'League',
  tournament: 'Tournament',
  pickup: 'Pickup',
  drop_in: 'Drop-in',
}

function EventCard({ league, teamCount }: { league: League; teamCount: number }) {
  const isPerTeam = league.payment_mode === 'per_team'
  const teamsAtCapacity = isPerTeam && league.max_teams !== null && teamCount >= league.max_teams
  const et = league.event_type ?? 'league'

  return (
    <Link
      href={`/events/${league.slug}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {EVENT_TYPE_LABELS[et] ?? et}
        </span>
        <span className={`text-xs font-medium ${teamsAtCapacity ? 'text-amber-600' : 'text-green-600'}`}>
          {teamsAtCapacity ? 'Teams Full' : 'Open'}
        </span>
      </div>
      <h3 className="text-lg font-bold mt-2 leading-snug" style={{ fontFamily: 'var(--brand-heading-font)' }}>
        {league.name}
      </h3>
      {league.season_start_date && (
        <p className="text-sm text-gray-500 mt-1">
          Starts {new Date(league.season_start_date).toLocaleDateString('en-CA', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      )}
      {(league.skill_level || (league.days_of_week?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {league.skill_level && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
              {league.skill_level}
            </span>
          )}
          {league.days_of_week?.map((d) => (
            <span key={d} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 capitalize">
              {d}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
        {teamsAtCapacity
          ? 'Players can still join a team'
          : league.price_cents === 0
            ? 'Free'
            : `$${(league.price_cents / 100).toFixed(0)} ${(league.currency ?? 'CAD').toUpperCase()}`}
      </p>
    </Link>
  )
}

function StaffAvatar({ member }: { member: StaffMember }) {
  const initial = member.name.charAt(0).toUpperCase()
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-3 ring-2 ring-white shadow-sm"
        style={{ backgroundColor: 'var(--brand-secondary)' }}>
        {member.avatar_url ? (
          <Image src={member.avatar_url} alt={member.name} width={80} height={80} className="w-full h-full object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white">
            {initial}
          </div>
        )}
      </div>
      <p className="font-semibold text-sm">{member.name}</p>
      {member.role && <p className="text-xs text-gray-500 mt-0.5">{member.role}</p>}
      {member.bio && <p className="text-xs text-gray-400 mt-1 leading-snug max-w-[10rem] mx-auto">{member.bio}</p>}
    </div>
  )
}

export function CommunityHome({
  org,
  branding,
  heroContent,
  aboutContent,
  photos,
  staff,
  openEvents,
  inSeasonEvents,
  completedEvents,
  teamCountMap,
  sectionLayout,
}: CommunityHomeProps) {
  void completedEvents

  const headline   = heroContent.headline   || org.name
  const subheadline = heroContent.subheadline || branding?.tagline || null
  const ctaLabel   = heroContent.cta_label  || 'View Events'
  const ctaHref    = heroContent.cta_href   || '/events'

  // Resolve ordered, visible section keys
  const orderedKeys = (() => {
    if (!sectionLayout || sectionLayout.length === 0) return DEFAULT_SECTION_ORDER
    const visible = sectionLayout.filter(s => s.visible).map(s => s.key)
    // Append any default keys not in stored layout
    for (const k of DEFAULT_SECTION_ORDER) {
      if (!sectionLayout.find(s => s.key === k)) visible.push(k)
    }
    return visible
  })()

  function renderSection(key: string) {
    switch (key) {
      case 'events':
        return (openEvents.length > 0 || inSeasonEvents.length > 0) ? (
          <div key="events">
            {openEvents.length > 0 && (
              <section className="max-w-5xl mx-auto w-full px-6 py-12">
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  Open for Registration
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {openEvents.map((league) => (
                    <EventCard key={league.id} league={league} teamCount={teamCountMap.get(league.id) ?? 0} />
                  ))}
                </div>
              </section>
            )}
            {inSeasonEvents.length > 0 && (
              <section className="max-w-5xl mx-auto w-full px-6 py-8">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  In Season
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inSeasonEvents.map((league) => (
                    <Link
                      key={league.id}
                      href={`/events/${league.slug}`}
                      className="block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow"
                    >
                      <h3 className="font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</h3>
                      <p className="text-sm text-gray-500 mt-1 capitalize">{EVENT_TYPE_LABELS[league.event_type ?? 'league'] ?? league.event_type}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null

      case 'about':
        return aboutContent.body ? (
          <section key="about" className="max-w-5xl mx-auto w-full px-6 py-12">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 sm:p-10">
              <h2
                className="text-2xl sm:text-3xl font-bold mb-4 uppercase"
                style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-secondary)' }}
              >
                {aboutContent.title || 'About Us'}
              </h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">
                {aboutContent.body}
              </p>
            </div>
          </section>
        ) : null

      case 'staff':
        return staff.length > 0 ? (
          <section key="staff" className="max-w-5xl mx-auto w-full px-6 py-12">
            <h2
              className="text-2xl sm:text-3xl font-bold mb-8 uppercase"
              style={{ fontFamily: 'var(--brand-heading-font)' }}
            >
              Meet the Team
            </h2>
            <div className="flex flex-wrap justify-center gap-8 sm:gap-10">
              {staff.map((member) => (
                <StaffAvatar key={member.id} member={member} />
              ))}
            </div>
          </section>
        ) : null

      case 'photos':
        return photos.length > 0 ? (
          <section key="photos" className="max-w-5xl mx-auto w-full px-6 py-12">
            <h2
              className="text-2xl sm:text-3xl font-bold mb-6 uppercase"
              style={{ fontFamily: 'var(--brand-heading-font)' }}
            >
              Gallery
            </h2>
            <div className="columns-2 sm:columns-3 gap-3 space-y-3">
              {photos.map((photo) => (
                <div key={photo.id} className="break-inside-avoid rounded-xl overflow-hidden group relative">
                  <Image
                    src={photo.url}
                    alt={photo.caption ?? 'Gallery photo'}
                    width={600}
                    height={400}
                    className="w-full object-cover"
                    unoptimized
                  />
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform">
                      <p className="text-white text-xs">{photo.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null

      default:
        return null
    }
  }

  const sections = orderedKeys.map(renderSection).filter(Boolean)
  const hasNoEvents = openEvents.length === 0 && inSeasonEvents.length === 0

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      {/* ── Hero (always first) ── */}
      <section
        className="relative py-24 px-6 text-white"
        style={{ backgroundColor: 'var(--brand-secondary)' }}
      >
        {branding?.hero_image_url && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${branding.hero_image_url})` }}
          />
        )}
        <div className="relative max-w-4xl mx-auto text-center">
          {branding?.logo_url && (
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-white/20 overflow-hidden">
                <Image src={branding.logo_url} alt={org.name} width={112} height={112} className="w-full h-full object-contain" unoptimized />
              </div>
            </div>
          )}
          <h1 className="text-5xl md:text-7xl font-bold uppercase tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {headline}
          </h1>
          {subheadline && <p className="mt-4 text-xl md:text-2xl opacity-80">{subheadline}</p>}
          <Link
            href={ctaHref}
            className="inline-block mt-8 px-8 py-3 rounded-md font-semibold text-lg text-white transition-opacity hover:opacity-90 active:opacity-80"
            style={{ backgroundColor: 'var(--brand-primary)', fontFamily: 'var(--brand-heading-font)' }}
          >
            {ctaLabel}
          </Link>
        </div>
      </section>

      {/* ── Dynamic sections in stored order ── */}
      {sections}

      {/* Empty state only when events section is visible but both lists are empty */}
      {hasNoEvents && orderedKeys.includes('events') && (
        <section className="max-w-5xl mx-auto w-full px-6 py-20 text-center">
          <p className="text-gray-400 text-lg">No events currently open.</p>
          <p className="text-gray-300 text-sm mt-1">Check back soon or contact the organizer.</p>
        </section>
      )}

      <div className="flex-1" />
      <Footer org={org} social={branding} />
    </div>
  )
}
