'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DisplaySponsor } from '@/lib/display-types'
import { buildWeightedPlaylist } from '@/lib/sponsor-weight'

/**
 * Rotating sponsor spotlight — one logo at a time, large and centered.
 * Cycles every 6 seconds through a tier-weighted playlist, so gold sponsors
 * appear more frequently. Complements the always-on running banner.
 */
export function SponsorsZone({ sponsors, theme }: { sponsors: DisplaySponsor[]; theme: 'dark' | 'light' }) {
  const isDark = theme === 'dark'
  const withLogos = useMemo(() => sponsors.filter((s) => s.logo_url), [sponsors])
  const playlist = useMemo(() => buildWeightedPlaylist(withLogos), [withLogos])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (playlist.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % playlist.length), 6000)
    return () => clearInterval(id)
  }, [playlist.length])

  if (playlist.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className={`text-xl ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>No sponsors yet</p>
      </div>
    )
  }

  const s = playlist[idx % playlist.length]
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
      <p className={`text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
        Our Sponsors
      </p>
      {s.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.logo_url} alt={s.name} className="max-h-[55%] max-w-[80%] object-contain" />
      ) : (
        <span className={`text-4xl font-bold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.name}</span>
      )}
      {withLogos.length > 1 && (
        <div className="flex gap-1.5">
          {withLogos.map((sp) => (
            <span
              key={sp.id}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: sp.id === s.id ? (isDark ? '#fff' : '#111') : (isDark ? '#3f3f46' : '#d1d5db') }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
