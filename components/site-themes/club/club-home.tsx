import Image from 'next/image'
import Link from 'next/link'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import type { OrgContext } from '@/lib/tenant'

type League = {
  id: string; name: string; slug: string; event_type: string | null; status: string
  season_start_date: string | null; price_cents: number; currency: string | null
  max_teams: number | null; payment_mode: string | null; skill_level: string | null
  days_of_week: string[] | null
}
type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null; tier: string }
type StaffMember = { id: string; name: string; role: string | null; bio: string | null; avatar_url: string | null }

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

const DEFAULT_SECTION_ORDER = ['events', 'about', 'staff', 'sponsors']
const TIER_ORDER = ['gold', 'silver', 'bronze', 'standard']

interface ClubHomeProps {
  org: OrgContext & { name: string; slug: string }
  branding: Branding | null
  heroContent: { headline?: string; subheadline?: string; cta_label?: string; cta_href?: string }
  aboutContent: { title?: string; body?: string }
  sponsors: Sponsor[]
  staff: StaffMember[]
  openEvents: League[]
  inSeasonEvents: League[]
  teamCountMap: Map<string, number>
  sectionLayout: { key: string; visible: boolean }[] | null
}

function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null
  const sorted = [...sponsors].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  return (
    <section className="border-t py-10 px-6" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-center text-gray-400 mb-6">Our Sponsors</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {sorted.map((s) => {
            const el = s.logo_url ? (
              <Image src={s.logo_url} alt={s.name} width={120} height={48} className="max-h-12 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" unoptimized />
            ) : (
              <span className="text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">{s.name}</span>
            )
            return s.website_url ? (
              <a key={s.id} href={s.website_url} target="_blank" rel="noopener noreferrer">{el}</a>
            ) : (
              <div key={s.id}>{el}</div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StaffRow({ staff }: { staff: StaffMember[] }) {
  if (staff.length === 0) return null
  return (
    <section className="border-t py-12 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold mb-6 uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-secondary)' }}>
          Our Team
        </h2>
        <div className="flex flex-wrap gap-6">
          {staff.map((member) => (
            <div key={member.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3 min-w-[180px]">
              <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--brand-primary)' }}>
                {member.avatar_url ? (
                  <Image src={member.avatar_url} alt={member.name} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{member.name}</p>
                {member.role && <p className="text-xs text-gray-500 truncate">{member.role}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ClubHome({ org, branding, heroContent, aboutContent, sponsors, staff, openEvents, inSeasonEvents, teamCountMap, sectionLayout }: ClubHomeProps) {
  const headline    = heroContent.headline    || org.name
  const subheadline = heroContent.subheadline || branding?.tagline || null
  const ctaLabel    = heroContent.cta_label   || 'Register Now'
  const ctaHref     = heroContent.cta_href    || '/events'

  const orderedKeys = (() => {
    if (!sectionLayout || sectionLayout.length === 0) return DEFAULT_SECTION_ORDER
    const visible = sectionLayout.filter(s => s.visible).map(s => s.key)
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
                <h2 className="text-xl font-bold mb-5 uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  Open for Registration
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {openEvents.map((league) => {
                    const isPerTeam = league.payment_mode === 'per_team'
                    const teamCount = teamCountMap.get(league.id) ?? 0
                    const atCapacity = isPerTeam && league.max_teams !== null && teamCount >= league.max_teams
                    return (
                      <Link key={league.id} href={`/events/${league.slug}`}
                        className="group block bg-white border rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}>
                            {league.event_type ?? 'league'}
                          </span>
                          {atCapacity
                            ? <span className="text-xs text-amber-600 font-medium">Teams Full</span>
                            : <span className="text-xs text-green-600 font-medium">Open</span>}
                        </div>
                        <h3 className="font-bold text-base leading-snug" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</h3>
                        {league.season_start_date && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(league.season_start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                        <p className="mt-3 text-sm font-semibold group-hover:underline" style={{ color: 'var(--brand-primary)' }}>
                          {league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency ?? 'CAD'}`} →
                        </p>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
            {inSeasonEvents.length > 0 && (
              <section className="max-w-5xl mx-auto w-full px-6 pb-10">
                <h2 className="text-xl font-bold mb-5 uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                  In Season
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {inSeasonEvents.map((league) => (
                    <Link key={league.id} href={`/events/${league.slug}`}
                      className="flex items-center justify-between bg-white border rounded-xl px-5 py-4 hover:shadow-sm transition-shadow"
                    >
                      <div>
                        <p className="font-semibold text-sm" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{league.event_type ?? 'league'}</p>
                      </div>
                      <span className="text-xs text-gray-400">Standings →</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null

      case 'about':
        return aboutContent.body ? (
          <section key="about" className="border-t py-12 px-6" style={{ backgroundColor: 'white' }}>
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl font-bold mb-4 uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-secondary)' }}>
                {aboutContent.title || 'About'}
              </h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">{aboutContent.body}</p>
            </div>
          </section>
        ) : null

      case 'staff':
        return staff.length > 0 ? <StaffRow key="staff" staff={staff} /> : null

      case 'sponsors':
        return sponsors.length > 0 ? <SponsorStrip key="sponsors" sponsors={sponsors} /> : null

      default:
        return null
    }
  }

  const sections = orderedKeys.map(renderSection).filter(Boolean)
  const hasNoEvents = openEvents.length === 0 && inSeasonEvents.length === 0

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      {/* ── Hero ── */}
      <section className="relative py-16 sm:py-20 px-6" style={{ backgroundColor: 'var(--brand-primary)' }}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-8">
          {branding?.logo_url && (
            <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 overflow-hidden">
              <Image src={branding.logo_url} alt={org.name} width={96} height={96} className="w-full h-full object-contain" unoptimized />
            </div>
          )}
          <div className="text-white text-center sm:text-left">
            <h1 className="text-4xl sm:text-5xl font-bold uppercase tracking-tight leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {headline}
            </h1>
            {subheadline && <p className="mt-2 text-white/80 text-lg">{subheadline}</p>}
            <div className="mt-6 flex flex-wrap gap-3 justify-center sm:justify-start">
              <Link href={ctaHref}
                className="px-6 py-2.5 rounded-md font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-secondary)', color: 'white', fontFamily: 'var(--brand-heading-font)' }}
              >
                {ctaLabel}
              </Link>
              <Link href="/schedule"
                className="px-6 py-2.5 rounded-md font-semibold text-sm bg-white/15 text-white hover:bg-white/25 transition-colors"
              >
                View Schedule
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick nav pills ── */}
      <div className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex overflow-x-auto gap-0 -mb-px">
            {[{ href: '/events', label: 'Events' }, { href: '/schedule', label: 'Schedule' }, { href: '/standings', label: 'Standings' }].map(({ href, label }) => (
              <Link key={href} href={href}
                className="shrink-0 px-5 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Dynamic sections ── */}
      {sections}

      {hasNoEvents && orderedKeys.includes('events') && (
        <section className="max-w-5xl mx-auto w-full px-6 py-20 text-center">
          <p className="text-gray-400">No events currently open. Check back soon.</p>
        </section>
      )}

      <div className="flex-1" />
      <Footer org={org} social={branding} />
    </div>
  )
}
