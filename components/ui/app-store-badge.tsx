import { SCOREBOARD_APP_STORE_URL } from '@/lib/scoreboard-app-store'

/**
 * Apple's official "Download on the App Store" badge (black, en-us), served
 * from /public so the CSP's img-src allows it. Apple's rules: use the artwork
 * unmodified, keep clear space of at least a quarter of its height around it,
 * and don't show it smaller than 40px tall on screen.
 */
export function AppStoreBadge({ height = 48, className = '' }: { height?: number; className?: string }) {
  const width = Math.round((height * 119.66407) / 40)
  return (
    <a href={SCOREBOARD_APP_STORE_URL} className={`inline-block press ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG; the optimizer adds nothing */}
      <img src="/app-store-badge.svg" alt="Download Fieldday Scoreboard on the App Store" width={width} height={height} className="block" />
    </a>
  )
}
