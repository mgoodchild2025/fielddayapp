'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DisplayData, ZoneConfig } from '@/lib/display-types'
import { PlayerBioCard } from '@/components/bios/player-bio-card'

/**
 * Showcase zone (S2): rotates player bio cards and/or approved event photos
 * with real transitions — crossfade, slide, Ken Burns. Bios enter with a
 * chyron sweep (photo first, lower-third a beat later). Respects
 * prefers-reduced-motion; preloads the next image.
 */

type Bio = DisplayData['showcase']['bios'][number]

type Slide =
  | { kind: 'bio'; bio: Bio; lineupTeam?: string | null }
  | { kind: 'photo'; url: string; caption: string | null }
  | { kind: 'matchup'; game: NonNullable<DisplayData['showcase']['nextGame']> }
  | { kind: 'banner'; banner: DisplayData['showcase']['banners'][number] }

/** Starting lineups play when the next game is within this window. */
const LINEUP_WINDOW_MS = 45 * 60 * 1000

function buildPlaylist(
  showcase: DisplayData['showcase'],
  source: 'bios' | 'photos' | 'both' | 'banners',
  order: 'shuffle' | 'newest',
  seed: number,
  lineups: boolean
): Slide[] {
  // Championship banners: the Hall of Champions sweeping the gym TV.
  // Newest-first is chronology — shuffle applies when chosen.
  if (source === 'banners') {
    const slides: Slide[] = showcase.banners.map((banner) => ({ kind: 'banner' as const, banner }))
    if (order !== 'shuffle') return slides
    let s = seed
    const a = [...slides]
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280
      const j = Math.floor((s / 233280) * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  // Starting lineups (S3): when a game is coming up, open with a matchup
  // slide, then the two rosters' opted-in cards back-to-back (home, then
  // away), before the normal rotation. Lineup bios are pulled out of the
  // tail so nobody airs twice in a cycle.
  let lineupSlides: Slide[] = []
  let lineupUserKeys = new Set<string>()
  const game = showcase.nextGame
  if (
    lineups && source !== 'photos' && game &&
    new Date(game.scheduledAt).getTime() - Date.now() <= LINEUP_WINDOW_MS &&
    new Date(game.scheduledAt).getTime() >= Date.now()
  ) {
    const home = showcase.bios.filter((b) => b.teamId === game.homeTeamId)
    const away = showcase.bios.filter((b) => b.teamId === game.awayTeamId)
    if (home.length + away.length > 0) {
      lineupSlides = [
        { kind: 'matchup', game },
        ...home.map((bio) => ({ kind: 'bio' as const, bio, lineupTeam: game.homeTeamName })),
        ...away.map((bio) => ({ kind: 'bio' as const, bio, lineupTeam: game.awayTeamName })),
      ]
      lineupUserKeys = new Set([...home, ...away].map((b) => b.name + (b.teamId ?? '')))
    }
  }

  const restBios = showcase.bios.filter((b) => !lineupUserKeys.has(b.name + (b.teamId ?? '')))
  const bios: Slide[] = source !== 'photos' ? restBios.map((bio) => ({ kind: 'bio' as const, bio })) : []
  const photos: Slide[] = source !== 'bios' ? showcase.photos.map((p) => ({ kind: 'photo' as const, url: p.url, caption: p.caption })) : []

  // Deterministic-ish shuffle from the seed so re-renders within a refresh
  // cycle keep the same order.
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    let s = seed
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280
      const j = Math.floor((s / 233280) * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const withLineups = (rest: Slide[]): Slide[] => [...lineupSlides, ...rest]

  if (source === 'both' && bios.length > 0 && photos.length > 0) {
    // Interleave: roughly two photos, then a bio
    const ps = order === 'shuffle' ? shuffle(photos) : photos
    const bs = order === 'shuffle' ? shuffle(bios) : bios
    const mixed: Slide[] = []
    let bi = 0
    ps.forEach((p, i) => {
      mixed.push(p)
      if ((i + 1) % 2 === 0 && bi < bs.length) mixed.push(bs[bi++])
    })
    while (bi < bs.length) mixed.push(bs[bi++])
    return withLineups(mixed)
  }
  const all = [...photos, ...bios]
  return withLineups(order === 'shuffle' ? shuffle(all) : all)
}

export function ShowcaseZone({
  showcase,
  config,
  theme,
  timezone = 'America/Toronto',
}: {
  showcase: DisplayData['showcase']
  config: Extract<ZoneConfig, { type: 'showcase' }>
  theme: 'dark' | 'light'
  timezone?: string
}) {
  const [seed] = useState(() => Math.floor(Date.now() / 60000)) // stable within the refresh cycle
  const playlist = useMemo(
    () => buildPlaylist(showcase, config.source, config.order, seed, config.lineups === true),
    [showcase, config.source, config.order, seed, config.lineups]
  )
  const [index, setIndex] = useState(0)
  const [entering, setEntering] = useState(true)

  const seconds = Math.min(60, Math.max(4, config.seconds || 8))

  useEffect(() => {
    if (playlist.length <= 1) return
    const t = setInterval(() => {
      setEntering(false)
      // brief exit beat, then advance + re-enter
      setTimeout(() => {
        setIndex((i) => (i + 1) % playlist.length)
        setEntering(true)
      }, 400)
    }, seconds * 1000)
    return () => clearInterval(t)
  }, [playlist.length, seconds])

  // Preload the next photo
  useEffect(() => {
    const next = playlist[(index + 1) % playlist.length]
    if (!next || next.kind === 'matchup' || next.kind === 'banner') return
    if (next.kind === 'photo') {
      const img = new Image()
      img.src = next.url
    } else if (next.kind === 'bio' && next.bio.photoUrl) {
      const img = new Image()
      img.src = next.bio.photoUrl
    }
  }, [index, playlist])

  if (playlist.length === 0) {
    return (
      <div className={`flex h-full items-center justify-center text-sm ${theme === 'dark' ? 'text-white/70' : 'text-gray-500'}`}>
        Nothing to showcase yet — approve event photos or have players opt in their bio cards.
      </div>
    )
  }

  const slide = playlist[index % playlist.length]
  const t = config.transition

  return (
    <div className={`relative h-full w-full overflow-hidden ${theme === 'dark' ? 'bg-black' : 'bg-gray-950'}`}>
      <style>{`
        @keyframes showcase-kenburns {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.12) translate(-2%, -1.5%); }
        }
        @keyframes showcase-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes showcase-slide-in { from { opacity: 0; transform: translateX(6%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes showcase-chyron { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .showcase-anim { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div
        key={index}
        className="showcase-anim absolute inset-0"
        style={{
          animation: entering
            ? t === 'slide' ? 'showcase-slide-in .7s ease-out both' : 'showcase-fade-in .8s ease-out both'
            : undefined,
          opacity: entering ? undefined : 0,
          transition: 'opacity .4s ease-in',
        }}
      >
        {slide.kind === 'banner' ? (
          <div className="flex h-full items-start justify-center pt-[4%]">
            <div
              className="w-[min(46vh,80%)] px-8 pb-24 pt-12 text-center text-[#f5efdd] shadow-2xl"
              style={{
                backgroundColor: 'var(--brand-primary, #24406e)',
                clipPath: 'polygon(0 0, 100% 0, 100% 84%, 50% 100%, 0 84%)',
              }}
            >
              <p className="showcase-anim text-7xl font-bold tracking-wide text-[#e9c96a]"
                 style={{ fontFamily: 'var(--brand-heading-font)', animation: 'showcase-chyron .6s ease-out .15s both' }}>
                {slide.banner.year}
              </p>
              <p className="showcase-anim mt-4 text-4xl font-bold uppercase leading-tight"
                 style={{ fontFamily: 'var(--brand-heading-font)', animation: 'showcase-chyron .7s ease-out .35s both' }}>
                {slide.banner.teamName}
              </p>
              <p className="showcase-anim mt-4 font-mono text-base uppercase tracking-[.25em] opacity-75"
                 style={{ animation: 'showcase-chyron .7s ease-out .55s both' }}>
                {slide.banner.leagueName} Champions
              </p>
            </div>
          </div>
        ) : slide.kind === 'matchup' ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-[6%] text-center text-white">
            <p className="showcase-anim font-mono text-lg uppercase tracking-[.3em] text-white/80"
               style={{ animation: 'showcase-chyron .6s ease-out .2s both' }}>
              Up Next
            </p>
            <p className="showcase-anim text-6xl font-bold uppercase leading-tight"
               style={{ fontFamily: 'var(--brand-heading-font)', animation: 'showcase-chyron .7s ease-out .4s both' }}>
              {slide.game.homeTeamName}
              <span className="mx-5 text-white/60">vs</span>
              {slide.game.awayTeamName}
            </p>
            <p className="showcase-anim text-2xl uppercase tracking-wide text-white/85"
               style={{ animation: 'showcase-chyron .7s ease-out .6s both' }}>
              {new Date(slide.game.scheduledAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
              {slide.game.court ? ` · Court ${slide.game.court}` : ''}
            </p>
          </div>
        ) : slide.kind === 'photo' ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.url}
              alt={slide.caption ?? 'Event photo'}
              className="showcase-anim h-full w-full object-cover"
              style={t === 'kenburns' ? { animation: `showcase-kenburns ${seconds + 2}s linear both` } : undefined}
            />
            {slide.caption && (
              <p className="showcase-anim absolute bottom-4 left-4 max-w-[80%] rounded bg-black/60 px-3 py-1.5 text-sm text-white"
                 style={{ animation: 'showcase-chyron .6s ease-out .4s both' }}>
                {slide.caption}
              </p>
            )}
          </>
        ) : (
          <div className="flex h-full items-end p-[5%] text-white">
            {/* Backdrop wash from the photo */}
            {slide.bio.photoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={slide.bio.photoUrl} alt="" aria-hidden
                className="showcase-anim absolute inset-0 h-full w-full object-cover opacity-25 blur-xl"
                style={t === 'kenburns' ? { animation: `showcase-kenburns ${seconds + 2}s linear both` } : undefined} />
            )}
            <div className="showcase-anim relative" style={{ animation: 'showcase-chyron .7s ease-out .35s both' }}>
              {slide.lineupTeam && (
                <p className="mb-4 inline-block bg-white/10 px-4 py-1.5 font-mono text-base uppercase tracking-[.25em] text-white/80">
                  Starting Lineup · {slide.lineupTeam}
                </p>
              )}
              {slide.bio.champion && (
                <p className={`mb-4 ${slide.lineupTeam ? 'ml-3' : ''} inline-block px-4 py-1.5 font-mono text-base uppercase tracking-[.25em] ${
                  slide.bio.champion.placement === 'gold' ? 'bg-amber-400/90 text-amber-950'
                  : slide.bio.champion.placement === 'silver' ? 'bg-gray-300/90 text-gray-800'
                  : slide.bio.champion.placement === 'bronze' ? 'bg-orange-400/90 text-orange-950'
                  : 'bg-purple-400/90 text-purple-950'
                }`}>
                  {slide.bio.champion.placement === 'gold' ? '🥇' : slide.bio.champion.placement === 'silver' ? '🥈' : slide.bio.champion.placement === 'bronze' ? '🥉' : '🏆'} {slide.bio.champion.label}
                </p>
              )}
              <div className={slide.bio.champion?.placement === 'gold' ? 'rounded-xl p-4 -m-4 ring-2 ring-amber-400/60 shadow-[0_0_60px_rgba(224,182,77,.25)]' : undefined}>
                <PlayerBioCard bio={slide.bio} size="tv" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
