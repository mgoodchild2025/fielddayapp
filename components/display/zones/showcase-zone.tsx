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

type Slide =
  | { kind: 'bio'; bio: DisplayData['showcase']['bios'][number] }
  | { kind: 'photo'; url: string; caption: string | null }

function buildPlaylist(
  showcase: DisplayData['showcase'],
  source: 'bios' | 'photos' | 'both',
  order: 'shuffle' | 'newest',
  seed: number
): Slide[] {
  const bios: Slide[] = source !== 'photos' ? showcase.bios.map((bio) => ({ kind: 'bio' as const, bio })) : []
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
    return mixed
  }
  const all = [...photos, ...bios]
  return order === 'shuffle' ? shuffle(all) : all
}

export function ShowcaseZone({
  showcase,
  config,
  theme,
}: {
  showcase: DisplayData['showcase']
  config: Extract<ZoneConfig, { type: 'showcase' }>
  theme: 'dark' | 'light'
}) {
  const [seed] = useState(() => Math.floor(Date.now() / 60000)) // stable within the refresh cycle
  const playlist = useMemo(
    () => buildPlaylist(showcase, config.source, config.order, seed),
    [showcase, config.source, config.order, seed]
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
    if (next?.kind === 'photo') {
      const img = new Image()
      img.src = next.url
    } else if (next?.kind === 'bio' && next.bio.photoUrl) {
      const img = new Image()
      img.src = next.bio.photoUrl
    }
  }, [index, playlist])

  if (playlist.length === 0) {
    return (
      <div className={`flex h-full items-center justify-center text-sm ${theme === 'dark' ? 'text-white/40' : 'text-gray-400'}`}>
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
        {slide.kind === 'photo' ? (
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
              <PlayerBioCard bio={slide.bio} size="tv" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
