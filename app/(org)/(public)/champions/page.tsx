import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getHallOfChampions } from '@/lib/hall-of-champions'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EventPodium } from '@/components/medals/event-podium'
import { assignBannerTints } from '@/lib/banner-tints'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { tallyShelf } from '@/lib/hall-boards'

export const metadata = { title: 'Hall of Champions' }

export default async function ChampionsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, hall] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
    getHallOfChampions(db, org.id),
  ])
  // Team colour where set, else palette — and no two fallback neighbours alike.
  const tints = assignBannerTints(hall.banners)
  const hasBoards = hall.dynasties.length > 0 || hall.decorated.length > 0 || hall.repeatChampions.length > 0
    || hall.tenure.length > 0 || hall.statLeaders.length > 0

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
                {hall.banners.map((b, i) => (
                  <a
                    key={b.medalId}
                    href={`#event-${b.leagueId}`}
                    className="block w-36 shrink-0 px-3 pb-8 pt-4 text-center text-[#f5efdd] shadow-lg transition-transform hover:-translate-y-0.5"
                    style={{
                      backgroundColor: tints[i],
                      clipPath: 'polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)',
                    }}
                    title={`${b.teamName} — ${b.leagueName}`}
                  >
                    <p className="text-xl font-bold tracking-wide text-[#e9c96a]" style={{ fontFamily: 'var(--brand-heading-font)' }}>
                      {b.year}
                    </p>
                    {/* Team badge — the live logo, or the coloured initial when the team is gone */}
                    <div className="mx-auto mt-2 w-fit rounded-full bg-white/90 p-0.5 shadow">
                      <TeamAvatar logoUrl={b.logoUrl} color={b.color} name={b.teamName} size="sm" />
                    </div>
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
            {hasBoards && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {hall.dynasties.length > 0 && (
                  <Board title="Dynasties" sub="Titles by team name across seasons">
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
                  </Board>
                )}

                {hall.repeatChampions.length > 0 && (
                  <Board title="Repeat champions" sub="Gold in two or more different events">
                    <ul className="mt-3 space-y-2">
                      {hall.repeatChampions.map((p) => (
                        <li key={p.userId ?? p.name} className="flex items-baseline justify-between gap-3 text-sm">
                          <PlayerName userId={p.userId} name={p.name} />
                          <span className="text-gray-500">
                            {'🥇'.repeat(Math.min(p.titles, 5))}{p.titles > 5 ? `×${p.titles}` : ''}{' '}
                            <span className="text-xs text-gray-400">{p.years.join(', ')}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Board>
                )}

                {hall.decorated.length > 0 && (
                  <Board title="Most decorated" sub="Career medals, all events — ties shown, nobody cut">
                    <ul className="mt-3 space-y-3">
                      {hall.decorated.map((tier, i) => {
                        const shelf = tallyShelf(tier)
                        const many = tier.players.length > 6
                        // The top two tiers always list names; crowded lower tiers fold to a count.
                        const open = i < 2 && !many
                        return (
                          <li key={shelf} className="text-sm">
                            <details open={open}>
                              <summary className="flex cursor-pointer items-baseline justify-between gap-3 list-none">
                                <span className="tracking-wide">{shelf}</span>
                                <span className="text-xs text-gray-400">
                                  {tier.players.length} player{tier.players.length !== 1 ? 's' : ''}
                                  <span className="ml-1 text-gray-300">▾</span>
                                </span>
                              </summary>
                              <p className="mt-1.5 text-gray-700 leading-relaxed">
                                {tier.players.map((p, j) => (
                                  <span key={p.userId ?? p.name}>
                                    {j > 0 && <span className="text-gray-300"> · </span>}
                                    <PlayerName userId={p.userId} name={p.name} />
                                  </span>
                                ))}
                              </p>
                            </details>
                          </li>
                        )
                      })}
                    </ul>
                  </Board>
                )}

                {hall.tenure.length > 0 && (
                  <Board title="Most seasons" sub="Events played with this club">
                    <ul className="mt-3 space-y-3">
                      {hall.tenure.map((tier) => (
                        <li key={tier.seasons} className="text-sm">
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold text-gray-800">{tier.seasons} seasons</span>
                            <span className="text-xs text-gray-400">{tier.players.length} player{tier.players.length !== 1 ? 's' : ''}</span>
                          </p>
                          <p className="mt-1 text-gray-700 leading-relaxed">
                            {tier.players.map((p, j) => (
                              <span key={p.userId ?? p.name}>
                                {j > 0 && <span className="text-gray-300"> · </span>}
                                <PlayerName userId={p.userId} name={p.name} />
                              </span>
                            ))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Board>
                )}

                {hall.statLeaders.map((board) => (
                  <Board key={board.sport} title={`Career ${board.statLabel.toLowerCase()}`} sub={`${board.sport.replace('_', ' ')} · all-time`}>
                    <ol className="mt-3 space-y-2">
                      {board.players.map((p, i) => (
                        <li key={p.userId ?? p.name} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="flex items-baseline gap-2">
                            <span className="w-4 text-right font-mono text-xs text-gray-400">{i + 1}</span>
                            <PlayerName userId={p.userId} name={p.name} />
                          </span>
                          <span className="font-mono text-gray-700" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
                        </li>
                      ))}
                    </ol>
                  </Board>
                ))}
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

function Board({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
      {children}
    </div>
  )
}

function PlayerName({ userId, name }: { userId: string | null; name: string }) {
  return userId ? (
    <Link href={`/players/${userId}/card`} className="font-semibold text-gray-800 hover:underline">{name}</Link>
  ) : (
    <span className="font-semibold text-gray-800">{name}</span>
  )
}
