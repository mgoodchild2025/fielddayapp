'use client'

import { useSyncExternalStore } from 'react'
import { detectMapPlatform, mapsHref, opensInNewTab, type MapPlatform } from '@/lib/maps'

// The device never changes while the page is open, so there's nothing to
// subscribe to; the server snapshot ('web') renders the Google Maps link,
// which the client swaps for the native one after hydration.
const subscribe = () => () => {}
const clientPlatform = (): MapPlatform =>
  detectMapPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
const serverPlatform = (): MapPlatform => 'web'

/** A link that opens `address` in the device's maps app (Google Maps on desktop). */
export function MapLink({ address, className, style, title, children }: {
  address: string
  className?: string
  style?: React.CSSProperties
  title?: string
  children: React.ReactNode
}) {
  const platform = useSyncExternalStore(subscribe, clientPlatform, serverPlatform)
  const newTab = opensInNewTab(platform)
  return (
    <a
      href={mapsHref(address, platform)}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className={className}
      style={style}
      title={title}
      aria-label={title ?? 'Open in maps'}
    >
      {children}
    </a>
  )
}
