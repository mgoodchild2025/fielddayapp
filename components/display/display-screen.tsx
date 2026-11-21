'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DisplayConfig, DisplayData, ZoneConfig } from '@/lib/display-types'
import { specOf, zoneGridArea, zoneDividers } from '@/lib/display-layouts'
import { ScheduleZone }  from './zones/schedule-zone'
import { StandingsZone } from './zones/standings-zone'
import { BracketZone }   from './zones/bracket-zone'
import { QrZone }        from './zones/qr-zone'
import { MessageZone }   from './zones/message-zone'
import { ClockZone }     from './zones/clock-zone'
import { LogoZone }      from './zones/logo-zone'
import { LiveZone }      from './zones/live-zone'
import { LiveScoresZone } from './zones/live-scores-zone'
import { SponsorsZone }  from './zones/sponsors-zone'
import { ShowcaseZone } from './zones/showcase-zone'
import { SponsorBanner } from './sponsor-banner'
import { SponsorInterstitial } from './sponsor-interstitial'

// ── Layout grid styles ────────────────────────────────────────────────────────

function gridStyle(layout: DisplayConfig['layout']): React.CSSProperties {
  const spec = specOf(layout)
  return { display: 'grid', gridTemplateColumns: spec.cols, gridTemplateRows: spec.rows }
}

// ── Zone renderer ─────────────────────────────────────────────────────────────

function ZoneRenderer({
  config, data, theme,
}: { config: ZoneConfig; data: DisplayData; theme: 'dark' | 'light' }) {
  switch (config.type) {
    case 'schedule':
      return (
        <ScheduleZone
          games={data.games}
          config={config}
          timezone={data.timezone}
          theme={theme}
          pools={data.pools}
          leagueId={data.league.id}
        />
      )
    case 'standings':
      return (
        <StandingsZone
          standings={data.standings}
          poolStandings={data.poolStandings}
          config={config}
          theme={theme}
          pools={data.pools}
          sport={data.league.sport}
          standingsConfig={data.standingsConfig}
        />
      )
    case 'bracket':
      return <BracketZone bracket={data.bracket} config={config as Extract<ZoneConfig, { type: 'bracket' }>} theme={theme} timezone={data.timezone} leagueId={data.league.id} />
    case 'qr_code':
      return <QrZone config={config} theme={theme} />
    case 'message':
      return <MessageZone config={config} theme={theme} />
    case 'clock':
      return <ClockZone timezone={data.timezone} theme={theme} />
    case 'logo':
      return <LogoZone orgName={data.org.name} logoUrl={data.org.logo_url} theme={theme} />
    case 'live':
      return <LiveZone live={data.live} theme={theme} />
    case 'live_scores':
      return <LiveScoresZone leagueId={data.league.id} theme={theme} />
    case 'sponsors':
      return <SponsorsZone sponsors={data.sponsors} theme={theme} />
    case 'showcase':
      return <ShowcaseZone showcase={data.showcase} config={config as Extract<ZoneConfig, { type: 'showcase' }>} theme={theme} timezone={data.timezone} />
    case 'empty':
    default:
      return null
  }
}

// ── Main display component ────────────────────────────────────────────────────

interface Props {
  config:  DisplayConfig
  data:    DisplayData
  screen:  number
}

export function DisplayScreen({ config, data, screen }: Props) {
  const router = useRouter()
  const isDark = config.theme === 'dark'

  // Auto-refresh: re-render the server component for fresh data — but only
  // once a cheap probe says the server is answering. A failed refresh makes
  // Next fall back to a full page load, which on a wifi blip or a deploy's
  // 502 replaced the TV with the browser's error page until someone walked
  // over to it. A skipped cycle just keeps the last frame.
  useEffect(() => {
    const secs = Math.max(10, config.refresh_seconds ?? 30)
    let busy = false
    const id = setInterval(async () => {
      if (busy || !navigator.onLine) return
      busy = true
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
        if (res.ok) router.refresh()
      } catch {
        // unreachable this cycle — try again next one
      } finally {
        clearTimeout(timer)
        busy = false
      }
    }, secs * 1000)
    return () => clearInterval(id)
  }, [config.refresh_seconds, router])

  // Keep the screen awake: the laptop / iPad / Chromebook driving the TV
  // dimmed or slept mid-evening. Re-acquired when the tab is shown again.
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> } }
        lock = (await nav.wakeLock?.request('screen')) ?? null
      } catch { /* denied / unsupported */ }
    }
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release?.().catch(() => {})
    }
  }, [])

  const bg     = isDark ? '#09090b' : '#f9fafb'
  const border = isDark ? '#27272a' : '#e5e7eb'
  const text   = isDark ? '#ffffff' : '#111827'
  const subtle = isDark ? '#3f3f46' : '#d1d5db'

  const banner = config.sponsor_banner
  const showBanner = banner?.enabled === true && data.sponsors.length > 0
  const bannerEl = showBanner
    ? <SponsorBanner sponsors={data.sponsors} speed={banner!.speed ?? 'normal'} theme={config.theme} />
    : null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none overflow-hidden"
      style={{ backgroundColor: bg, color: text, fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Optional header bar */}
      {config.show_header && (
        <div
          className="shrink-0 flex items-center justify-between px-5 py-2"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-3">
            {data.org.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.org.logo_url} alt={data.org.name} className="h-8 w-8 object-contain rounded" />
            )}
            <span className="text-base font-bold" style={{ color: text }}>
              {data.league.name}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {screen > 1 && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ background: subtle, color: isDark ? '#a1a1aa' : '#6b7280' }}
              >
                Screen {screen}
              </span>
            )}
            <LiveClock timezone={data.timezone} isDark={isDark} />
          </div>
        </div>
      )}

      {/* Sponsor banner — top */}
      {showBanner && banner!.position === 'top' && bannerEl}

      {/* Zone grid */}
      <div className="flex-1 overflow-hidden" style={gridStyle(config.layout)}>
        {config.zones.map((zone, i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{
              ...zoneGridArea(config.layout, i),
              borderRight:  zoneDividers(config.layout, i).right ? `1px solid ${border}` : undefined,
              borderBottom: zoneDividers(config.layout, i).bottom ? `1px solid ${border}` : undefined,
            }}
          >
            <ZoneRenderer config={zone} data={data} theme={config.theme} />
          </div>
        ))}
      </div>

      {/* Sponsor banner — bottom (default) */}
      {showBanner && banner!.position !== 'top' && bannerEl}

      {/* Full-screen sponsor interstitial overlay */}
      {config.sponsor_interstitial?.enabled && data.sponsors.some((s) => s.ad_image_url) && (
        <SponsorInterstitial sponsors={data.sponsors} config={config.sponsor_interstitial} theme={config.theme} />
      )}

      {/* Subtle updated-at footer */}
      <div
        className="absolute bottom-2 right-3 text-[10px] pointer-events-none"
        style={{ color: isDark ? '#3f3f46' : '#d1d5db' }}
      >
        Live · refreshes every {config.refresh_seconds}s
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function LiveClock({ timezone, isDark }: { timezone: string; isDark: boolean }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const t = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  }).format(now)
  return (
    <span className="text-sm font-semibold tabular-nums" style={{ color: isDark ? '#a1a1aa' : '#6b7280' }}>
      {t}
    </span>
  )
}

