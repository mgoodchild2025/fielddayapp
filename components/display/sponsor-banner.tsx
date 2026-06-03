'use client'

import { useRef, useEffect, useState } from 'react'
import type { DisplaySponsor, SponsorBannerConfig } from '@/lib/display-types'

const SPEED_SECONDS: Record<SponsorBannerConfig['speed'], number> = {
  slow: 60, normal: 40, fast: 24,
}

/** Gap between logos (px) — also applied as padding-right on each copy so
 *  the seam between copy A and copy B matches every other gap exactly. */
const GAP = 128 // 8rem at 16px base

/**
 * A horizontal auto-scrolling marquee of sponsor logos.
 *
 * Two identical copies of the logo list are placed side by side. We measure
 * the pixel width of the first copy (via useRef) and use that as the
 * translateX distance — so the animation always scrolls by exactly one copy
 * width, the seam is seamless, and spacing between logos is always uniform
 * regardless of how many sponsors there are.
 *
 * The gap between logos is a fixed GAP px, with the same value applied as
 * padding-right on each copy, so the gap at the seam equals every other gap.
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
  const halfRef = useRef<HTMLDivElement>(null)
  const [copyWidth, setCopyWidth] = useState<number>(0)

  useEffect(() => {
    const measure = () => {
      if (halfRef.current) setCopyWidth(halfRef.current.offsetWidth)
    }
    measure()
    // Re-measure if logos load and change the width
    const ro = new ResizeObserver(measure)
    if (halfRef.current) ro.observe(halfRef.current)
    return () => ro.disconnect()
  }, [sponsors])

  if (sponsors.length === 0) return null

  const logoList = (ref?: React.Ref<HTMLDivElement>, hidden?: boolean) => (
    <div
      ref={ref}
      className="flex shrink-0 items-center"
      // padding-right = GAP so the gap at the seam equals all other gaps
      style={{ gap: `${GAP}px`, paddingRight: `${GAP}px`, paddingLeft: '3rem' }}
      aria-hidden={hidden}
    >
      {sponsors.map((s) => (
        <div
          key={s.id}
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
      ))}
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
      {/* Inject a per-instance keyframe using the measured copy width so the
          translate is always exactly one copy width — no gaps, no jumps. */}
      {copyWidth > 0 && (
        <style>{`
          @keyframes sponsor-marquee-${copyWidth} {
            from { transform: translateX(0); }
            to   { transform: translateX(-${copyWidth}px); }
          }
        `}</style>
      )}
      <div
        className="flex items-center"
        style={{
          willChange: 'transform',
          animation: copyWidth > 0
            ? `sponsor-marquee-${copyWidth} ${duration}s linear infinite`
            : 'none',
        }}
      >
        {/* Copy A — measured to get the scroll distance */}
        {logoList(halfRef)}
        {/* Copy B — seamless repeat */}
        {logoList(undefined, true)}
      </div>
    </div>
  )
}
