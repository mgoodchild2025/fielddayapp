import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { Film } from 'lucide-react'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { redirectToLogin } from '@/lib/auth'
import { getOrgBrandingCached } from '@/lib/org-cache'
import { loadSeasonWrapped } from '@/lib/season-wrapped-load'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EmptyState } from '@/components/ui/empty-state'
import { BackLink } from '@/components/ui/back-link'
import { ResultCardShare } from '@/components/games/result-card-share'

export const metadata: Metadata = { title: 'Your season, wrapped' }

/**
 * Season Wrapped: the signed-in player's own summary of a finished event —
 * tiles worth being proud of and a story image to share. Only ever the
 * viewer's own season (the user comes from the session, never the URL).
 */
export default async function WrappedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await getCurrentOrg(await headers())
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const db = createServiceRoleClient()
  const [view, branding] = await Promise.all([
    loadSeasonWrapped(db, org.id, slug, user.id),
    getOrgBrandingCached(org.id),
  ])
  const logoUrl = (branding as { logo_url?: string } | null)?.logo_url ?? null

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
        <div className="mx-auto max-w-xl w-full px-4 py-6">
          <BackLink fallbackHref={`/events/${slug}`} fallbackLabel="Event page" />
          {!view ? (
            <EmptyState
              icon={Film}
              className="mt-4"
              title="No wrapped season here yet"
              hint="Season Wrapped appears once an event you played in is finished."
              action={{ href: '/dashboard', label: 'Back to Home' }}
            />
          ) : (
            <>
              <section className="mt-3 rounded-2xl bg-gray-900 text-white px-6 py-8 overflow-hidden relative">
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-primary">Season wrapped</p>
                <h1 className="mt-1 text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>{view.league.name}</h1>
                <p className="mt-1 text-sm text-white/70">
                  {view.playerName}{view.team ? ` · ${view.team.name}` : ''}
                </p>
                <p className="mt-6 text-4xl font-black tracking-tight">
                  {view.wrapped.medalGlyph && <span aria-hidden className="mr-2">{view.wrapped.medalGlyph}</span>}
                  {view.wrapped.headline}
                </p>
              </section>

              {view.wrapped.tiles.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-3">
                  {view.wrapped.tiles.map((t, i) => (
                    <li
                      key={t.key}
                      className="fd-step-in rounded-xl border bg-white px-4 py-4"
                      style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
                    >
                      <p className="text-3xl font-black tabular-nums text-gray-900">{t.value}</p>
                      <p className="mt-1 text-sm font-medium text-gray-600">{t.label}</p>
                      {t.sub && <p className="text-xs text-gray-500">{t.sub}</p>}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 rounded-xl border bg-white px-4 pb-5">
                <ResultCardShare
                  src={`/wrapped/${view.league.slug}/card`}
                  fileName={`${view.league.slug}-season-wrapped.png`}
                  title={`My ${view.league.name} season`}
                  heading="Share your season"
                  anchorId="share"
                  story
                />
              </div>
            </>
          )}
        </div>
      </main>
      <Footer org={org} />
    </div>
  )
}
