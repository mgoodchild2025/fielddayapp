'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import type { DisplaySponsor, SponsorBannerConfig } from '@/lib/display-types'

const SPEED_SECONDS: Record<SponsorBannerConfig['speed'], number> = {
  slow: 60, normal: 40, fast: 24,
}

/** Gap between every logo (px). Same value applied as padding-right on each
 *  copy so the gap at the seam always equals every other gap. */
const GAP = 128 // 8rem

/**
 * Number of times to tile the full sponsor list inside each copy.
 * Ensures the copy is always wider than the screen so logos fill the viewport
 * from edge to edge. Formula: at least enough tiles so (logos × ~300px avg)
 * exceeds a typical TV/monitor width, with a minimum of 3.
 */
function tileCount(sponsorCount: number): number {
  return Math.max(3, Math.ceil(8 / sponsorCount))
}

/**
 * A horizontal auto-scrolling marquee of sponsor logos.
 *
 * Approach: tile the sponsor list enough times inside each "copy" so that one
 * copy is always wider than the screen. Then duplicate the copy (A + B).
 * We measure copy A's pixel width and inject a scoped @keyframes that translates
 * by exactly that many px. The seam between A and B is seamless (gap = GAP px on
 * both sides), logos fill the full width at all times, and spacing is uniform.
 */
export function SponsorBanner({
  sponsors, speed, theme,
}: {
  sponsors: DisplaySponsor[]
  speed: SponsorBannerConfig['speed']
  theme: 'dark' | 'light'
}) {
  const isDark = theme === 'dark'
  const duration = SPEED_SECONDS[speed] ?? 40
  const copyRef = useRef<HTMLDivElement>(null)
  const [copyWidth, setCopyWidth] = useState<number>(0)

  const tiles = useMemo(
    () => Array.from({ length: tileCount(sponsors.length) }),
    [sponsors.length],
  )

  useEffect(() => {
    const measure = () => {
      if (copyRef.current) setCopyWidth(copyRef.current.offsetWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (copyRef.current) ro.observe(copyRef.current)
    return () => ro.disconnect()
  }, [sponsors, tiles.length])

  if (sponsors.length === 0) return null

  // One "copy" = all sponsors repeated `tiles.length` times, with GAP between
  // every logo and GAP padding-right so the seam gap matches all others.
  const renderCopy = (ref?: React.Ref<HTMLDivElement>, hidden?: boolean) => (
    <div
      ref={ref}
      className="flex shrink-0 items-center"
      style={{ gap: `${GAP}px`, paddingRight: `${GAP}px` }}
      aria-hidden={hidden}
    >
      {tiles.flatMap((_, t) =>
        sponsors.map((s) => (
          <div
            key={`${t}-${s.id}`}
            className="flex items-center shrink-0"
            style={{ height: s.tier === 'gold' ? '4.5rem' : '3.25rem' }}
          >
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.logo_url}
                alt={s.name}
                className="h-full w-auto object-contain"
                style={{ maxWidth: '16rem' }}
              />
            ) : (
              <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {s.name}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  )

  return (
    <div
      className="shrink-0 w-full overflow-hidden flex items-center"
      style={{
        height: '6rem',
        backgroundColor: isDark ? '#000000' : '#ffffff',
        borderTop:    `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
        borderBottom: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
      }}
    >
      {copyWidth > 0 && (
        <style>{`
          @keyframes sm-${copyWidth} {
            from { transform: translateX(0); }
            to   { transform: translateX(-${copyWidth}px); }
          }
        `}</style>
      )}
      <div
        className="flex items-center"
        style={{
          willChange: 'transform',
          animation: copyWidth > 0 ? `sm-${copyWidth} ${duration}s linear infinite` : 'none',
        }}
      >
        {renderCopy(copyRef)}
        {renderCopy(undefined, true)}
      </div>
    </div>
  )
}
