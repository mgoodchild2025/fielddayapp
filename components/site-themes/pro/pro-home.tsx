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
type RecentResult = {
  id: string; home_score: number | null; away_score: number | null
  home_team_name: string; away_team_name: string
  league_name: string | null; scheduled_at: string
}
type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null; tier: string }

interface ProHomeProps {
  org: OrgContext & { name: string; slug: string }
  branding: { tagline: string | null; hero_image_url: string | null; logo_url: string | null } | null
  heroContent: { headline?: string; subheadline?: string; cta_label?: string; cta_href?: string }
  sponsors: Sponsor[]
  recentResults: RecentResult[]
  openEvents: League[]
  inSeasonEvents: League[]
  teamCountMap: Map<string, number>
}

const TIER_LABELS: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', standard: '' }
const TIER_ORDER = ['gold', 'silver', 'bronze', 'standard']

function SponsorSection({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null
  const sorted = [...sponsors].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  const gold = sorted.filter(s => s.tier === 'gold')
  const rest = sorted.filter(s => s.tier !== 'gold')

  return (
    <section className="py-12 px-6" style={{ backgroundColor: 'var(--brand-secondary)' }}>
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-center text-white/40 mb-8">Partners & Sponsors</p>
        {gold.length > 0 && (
          <div className="mb-8">
            <p className="text-xs text-center text-yellow-400/70 uppercase tracking-widest mb-4">Gold</p>
            <div className="flex flex-wrap items-center justify-center gap-10">
              {gold.map(s => (
                <SponsorLogo key={s.id} sponsor={s} size="lg" />
              ))}
            </div>
          </div>
        )}
        {rest.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-8">
            {rest.map(s => (
              <SponsorLogo key={s.id} sponsor={s} size="sm" />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SponsorLogo({ sponsor, size }: { sponsor: Sponsor; size: 'sm' | 'lg' }) {
  const el = sponsor.logo_url ? (
    <Image
      src={sponsor.logo_url} alt={sponsor.name}
      width={size === 'lg' ? 160 : 100} height={size === 'lg' ? 60 : 40}
      className={`${size === 'lg' ? 'max-h-14' : 'max-h-9'} w-auto object-contain opacity-60 hover:opacity-100 transition-opacity`}
      unoptimized
    />
  ) : (
    <span className={`font-semibold text-white/60 hover:text-white transition-colors ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
      {sponsor.name}
    </span>
  )
  return sponsor.website_url
    ? <a href={sponsor.website_url} target="_blank" rel="noopener noreferrer">{el}</a>
    : <div>{el}</div>
}

export function ProHome({ org, branding, heroContent, sponsors, recentResults, openEvents, inSeasonEvents, teamCountMap }: ProHomeProps) {
  const headline = heroContent.headline || org.name
  const subheadline = heroContent.subheadline || branding?.tagline || null
  const ctaLabel = heroContent.cta_label || 'Register'
  const ctaHref = heroContent.cta_href || '/events'

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      {/* ── Dark dramatic hero ── */}
      <section className="relative py-20 sm:py-28 px-6 text-white overflow-hidden" style={{ backgroundColor: 'var(--brand-secondary)' }}>
        {branding?.hero_image_url && (
          <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${branding.hero_image_url})` }} />
        )}
        {/* Accent stripe */}
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: 'var(--brand-primary)' }} />
        <div className="relative max-w-4xl mx-auto flex flex-col sm:flex-row items-start gap-8">
          {branding?.logo_url && (
            <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded overflow-hidden opacity-90">
              <Image src={branding.logo_url} alt={org.name} width={80} height={80} className="w-full h-full object-contain" unoptimized />
            </div>
          )}
          <div>
            <h1 className="text-5xl sm:text-6xl font-black uppercase tracking-tight leading-none" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {headline}
            </h1>
            {subheadline && <p className="mt-3 text-white/60 text-base sm:text-lg max-w-xl">{subheadline}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={ctaHref}
                className="px-6 py-2.5 rounded font-bold text-sm uppercase tracking-wide transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)', color: 'white', fontFamily: 'var(--brand-heading-font)' }}
              >
                {ctaLabel}
              </Link>
              <Link href="/schedule" className="px-6 py-2.5 rounded font-bold text-sm uppercase tracking-wide border border-white/20 text-white/80 hover:border-white/50 transition-colors">
                Schedule
              </Link>
              <Link href="/standings" className="px-6 py-2.5 rounded font-bold text-sm uppercase tracking-wide border border-white/20 text-white/80 hover:border-white/50 transition-colors">
                Standings
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent Results ── */}
      {recentResults.length > 0 && (
        <section className="border-b" style={{ backgroundColor: 'var(--brand-secondary)' }}>
          <div className="max-w-5xl mx-auto px-6 py-4 overflow-x-auto">
            <div className="flex gap-4 min-w-max">
              {recentResults.map((r) => (
                <div key={r.id} className="shrink-0 bg-white/5 rounded-lg px-4 py-3 text-white text-center min-w-[140px]">
                  {r.league_name && <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">{r.league_name}</p>}
                  <p className="text-xs text-white/60 truncate max-w-[120px] mx-auto">{r.home_team_name}</p>
                  <p className="text-2xl font-black my-1" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                    {r.home_score ?? '—'} <span className="text-white/30 text-lg">·</span> {r.away_score ?? '—'}
                  </p>
                  <p className="text-xs text-white/60 truncate max-w-[120px] mx-auto">{r.away_team_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Open for Registration ── */}
      {openEvents.length > 0 && (
        <section className="max-w-5xl mx-auto w-full px-6 py-12">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-xl font-black uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              Open for Registration
            </h2>
            <Link href="/events" className="text-xs text-gray-400 hover:text-gray-600">All events →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {openEvents.map((league) => {
              const isPerTeam = league.payment_mode === 'per_team'
              const teamCount = teamCountMap.get(league.id) ?? 0
              const atCapacity = isPerTeam && league.max_teams !== null && teamCount >= league.max_teams
              return (
                <Link
                  key={league.id}
                  href={`/events/${league.slug}`}
                  className="group block rounded-xl border-l-4 bg-white border border-gray-100 hover:shadow-md transition-all p-5 relative overflow-hidden"
                  style={{ borderLeftColor: 'var(--brand-primary)' }}
                >
                  <h3 className="font-black text-base uppercase tracking-tight leading-tight mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                    {league.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="capitalize">{league.event_type ?? 'league'}</span>
                    {league.skill_level && <><span>·</span><span className="capitalize">{league.skill_level}</span></>}
                  </div>
                  <p className="mt-3 text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
                    {atCapacity ? 'Teams Full' : league.price_cents === 0 ? 'Free' : `$${(league.price_cents / 100).toFixed(0)} ${league.currency ?? 'CAD'}`}
                  </p>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── In Season ── */}
      {inSeasonEvents.length > 0 && (
        <section className="max-w-5xl mx-auto w-full px-6 pb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            Active Leagues
          </h2>
          <div className="space-y-2">
            {inSeasonEvents.map((league) => (
              <Link
                key={league.id}
                href={`/events/${league.slug}`}
                className="flex items-center justify-between bg-white border rounded-xl px-5 py-4 hover:shadow-sm transition-shadow"
              >
                <p className="font-bold text-sm uppercase tracking-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>{league.name}</p>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
                  Standings →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {openEvents.length === 0 && inSeasonEvents.length === 0 && (
        <section className="max-w-5xl mx-auto w-full px-6 py-20 text-center">
          <p className="text-gray-400">No active events. Stay tuned.</p>
        </section>
      )}

      <div className="flex-1" />
      <SponsorSection sponsors={sponsors} />
      <Footer org={org} />
    </div>
  )
}
