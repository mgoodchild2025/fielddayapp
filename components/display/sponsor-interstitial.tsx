'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DisplaySponsor, SponsorInterstitialConfig } from '@/lib/display-types'
import { buildWeightedPlaylist } from '@/lib/sponsor-weight'

/**
 * Periodic full-screen sponsor interstitial. Every `every_seconds` it fades in a
 * sponsor's ad creative for `duration_seconds`, then returns to the content.
 * Cycles through ad-eligible sponsors on a tier-weighted playlist (gold more often).
 */
export function SponsorInterstitial({
  sponsors, config, theme,
}: {
  sponsors: DisplaySponsor[]
  config: SponsorInterstitialConfig
  theme: 'dark' | 'light'
}) {
  const ads = useMemo(() => buildWeightedPlaylist(sponsors.filter((s) => s.ad_image_url)), [sponsors])
  const [visible, setVisible] = useState(false)
  const [idx, setIdx] = useState(0)

  const every = Math.max(15, config.every_seconds ?? 120)
  const dur = Math.max(3, config.duration_seconds ?? 8)

  useEffect(() => {
    if (ads.length === 0) return
    let showTimer: ReturnType<typeof setTimeout>
    let hideTimer: ReturnType<typeof setTimeout>

    const scheduleShow = () => {
      showTimer = setTimeout(() => {
        setVisible(true)
        hideTimer = setTimeout(() => {
          setVisible(false)
          setIdx((i) => (i + 1) % ads.length)
          scheduleShow()
        }, dur * 1000)
      }, every * 1000)
    }
    scheduleShow()

    return () => { clearTimeout(showTimer); clearTimeout(hideTimer) }
  }, [ads.length, every, dur])

  if (ads.length === 0 || !visible) return null
  const ad = ads[idx % ads.length]

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center animate-[fadeIn_0.4s_ease]"
      style={{ backgroundColor: theme === 'dark' ? '#000000' : '#ffffff' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.ad_image_url!} alt={ad.name} className="max-w-full max-h-full object-contain" />
    </div>
  )
}
