'use client'

import { useEffect, useState } from 'react'
import type { DisplaySponsor } from '@/lib/display-types'

/**
 * Rotating sponsor spotlight — one logo at a time, large and centered.
 * Cycles every 6 seconds. Use in a zone for a premium, attention-grabbing
 * placement (complements the always-on running banner).
 */
export function SponsorsZone({ sponsors, theme }: { sponsors: DisplaySponsor[]; theme: 'dark' | 'light' }) {
  const [idx, setIdx] = useState(0)
  const isDark = theme === 'dark'

  useEffect(() => {
    if (sponsors.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % sponsors.length), 6000)
    return () => clearInterval(id)
  }, [sponsors.length])

  if (sponsors.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className={`text-xl ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>No sponsors yet</p>
      </div>
    )
  }

  const s = sponsors[idx % sponsors.length]
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
      {sponsors.length > 1 && (
        <div className="flex gap-1.5">
          {sponsors.map((sp, i) => (
            <span
              key={sp.id}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i === idx % sponsors.length ? (isDark ? '#fff' : '#111') : (isDark ? '#3f3f46' : '#d1d5db') }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
