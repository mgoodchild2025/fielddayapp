import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getHallOfChampions } from '@/lib/hall-of-champions'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EventPodium } from '@/components/medals/event-podium'
import { bannerTint } from '@/lib/banner-tints'

export const metadata = { title: 'Hall of Champions' }

export default async function ChampionsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, hall] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
    getHallOfChampions(db, org.id),
  ])

  return (
    <div className="flex flex-col min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          🏆 Hall of Champions
        </h1>
        <p className="text-sm opacity-70 mt-1">
          {hall.totalTitles > 0
            ? `${hall.totalTitles} title${hall.totalTitles !== 1 ? 's' : ''} and counting.`
            : 'Every champion this org ever crowns will hang here.'}
        </p>

        {hall.totalTitles === 0 ? (
          <div className="mt-12 rounded-xl border bg-white px-6 py-14 text-center">
            <p className="text-4xl" aria-hidden>🏟️</p>
            <p className="mt-3 font-semibold text-gray-700">The rafters are empty — for now.</p>
            <p className="mt-1 text-sm text-gray-500">The first banner is still up for grabs.</p>
          </div>
        ) : (
          <>
            {/* ── The banner wall ─────────────────────────────────────────── */}
            <div className="mt-8 overflow-x-auto rounded-xl border bg-white pb-6">
              <div className="h-1.5 bg-gray-300 shadow-sm" />
              <div className="flex gap-4 px-5" style={{ minWidth: 'max-content' }}>
                {hall.banners.map((b) => (
                  <a
                    key={b.medalId}
                    href={`#event-${b.leagueId}`}
                    className="block w-36 shrink-0 px-3 pb-8 pt-4 text-center text-[#f5efdd] shadow-lg transition-transform hover:-translate-y-0.5"
                    style={{
                      backgroundColor: bannerTint(b.teamName, b.year),
                      clipPath: 'polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)',
                    }}
                    title={`${b.teamName} — ${b.leagueName}`}
                  >
                    <p className="text-xl font-bold tracking-wide text-[#e9c96a]" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                      {b.year}
                    </p>
                    <p className="mt-1 text-sm font-bold uppercase leading-tight" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                      {b.teamName}
                    </p>
                    <p className="mt-1.5 font-mono text-[9px] uppercase tracking-widest opacity-75">
                      {b.leagueName}
                    </p>
                  </a>
                ))}
              </div>
            </div>

            {/* ── Honour rolls ────────────────────────────────────────────── */}
            {(hall.dynasties.length > 0 || hall.decorated.length > 0) && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {hall.dynasties.length > 0 && (
                  <div className="rounded-xl border bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Dynasties</p>
                    <p className="text-[11px] text-gray-400">Titles by team name across seasons</p>
                    <ul className="mt-3 space-y-2">
                      {hall.dynasties.map((d) => (
                        <li key={d.teamName} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold text-gray-800">{d.teamName}</span>
                          <span className="text-gray-500">
                            {d.titles}× champions <span className="text-gray-300">·</span>{' '}
                            <span className="text-xs text-gray-400">{d.years.join(', ')}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hall.decorated.length > 0 && (
                  <div className="rounded-xl border bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Most decorated</p>
                    <p className="text-[11px] text-gray-400">Career medals, all events</p>
                    <ul className="mt-3 space-y-2">
                      {hall.decorated.map((p) => {
                        const shelf = [
                          p.gold > 0 && `🥇${p.gold > 1 ? p.gold : ''}`,
                          p.silver > 0 && `🥈${p.silver > 1 ? p.silver : ''}`,
                          p.bronze > 0 && `🥉${p.bronze > 1 ? p.bronze : ''}`,
                          p.tierTitles > 0 && `🏆${p.tierTitles > 1 ? p.tierTitles : ''}`,
                        ].filter(Boolean).join(' ')
                        return (
                          <li key={p.userId ?? p.name} className="flex items-baseline justify-between gap-3 text-sm">
                            {p.userId ? (
                              <Link href={`/players/${p.userId}/card`} className="font-semibold text-gray-800 hover:underline">
                                {p.name}
                              </Link>
                            ) : (
                              <span className="font-semibold text-gray-800">{p.name}</span>
                            )}
                            <span className="tracking-wide">{shelf}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ── Season sections ─────────────────────────────────────────── */}
            {hall.seasons.map((season) => (
              <section key={season.year} className="mt-10">
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{season.year}</h2>
                <div className="mt-3 space-y-4">
                  {season.events.map((event) => (
                    <div key={event.leagueId} id={`event-${event.leagueId}`} className="scroll-mt-20">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold opacity-80">{event.leagueName}</p>
                        {event.leagueSlug && (
                          <Link href={`/events/${event.leagueSlug}`} className="text-xs opacity-60 hover:underline">
                            View event →
                          </Link>
                        )}
                      </div>
                      <EventPodium medals={event.medals} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
      <Footer org={org} />
    </div>
  )
}
