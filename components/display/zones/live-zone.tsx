'use client'

import type { DisplayData } from '@/lib/display-types'

interface Props {
  live: DisplayData['live']
  theme: 'dark' | 'light'
}

export function LiveZone({ live, theme }: Props) {
  const isDark = theme === 'dark'
  const subtext = isDark ? '#a1a1aa' : '#6b7280'

  // No live stream → quiet placeholder
  if (!live) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span style={{ fontSize: 32, opacity: 0.3 }}>📺</span>
        <p style={{ color: subtext, fontSize: 14 }}>No live stream right now</p>
      </div>
    )
  }

  // YouTube → full-bleed autoplay embed (muted so browsers allow autoplay on a TV)
  if (live.embed_url) {
    const src = live.embed_url.includes('mute=')
      ? live.embed_url
      : `${live.embed_url}${live.embed_url.includes('?') ? '&' : '?'}mute=1`
    return (
      <div className="relative w-full h-full">
        <iframe
          src={src}
          title={live.title ?? 'Live stream'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
        {/* Live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          LIVE
        </div>
      </div>
    )
  }

  // Not embeddable (e.g. Instagram Live) → branded "watch live" card with QR-friendly URL
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="flex items-center gap-2 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-full">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        LIVE NOW
      </div>
      <p style={{ fontSize: 28, fontWeight: 800, color: isDark ? '#fff' : '#111', lineHeight: 1.1 }}>
        {live.title ?? `We're live on ${live.platform}`}
      </p>
      <p style={{ color: subtext, fontSize: 16 }}>Watch at</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', wordBreak: 'break-all' }}>{live.url}</p>
    </div>
  )
}
