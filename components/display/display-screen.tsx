'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DisplayConfig, DisplayData, ZoneConfig } from '@/lib/display-types'
import { ScheduleZone }  from './zones/schedule-zone'
import { StandingsZone } from './zones/standings-zone'
import { BracketZone }   from './zones/bracket-zone'
import { QrZone }        from './zones/qr-zone'
import { MessageZone }   from './zones/message-zone'
import { ClockZone }     from './zones/clock-zone'
import { LogoZone }      from './zones/logo-zone'
import { LiveZone }      from './zones/live-zone'
import { SponsorsZone }  from './zones/sponsors-zone'
import { SponsorBanner } from './sponsor-banner'

// ── Layout grid styles ────────────────────────────────────────────────────────

function gridStyle(layout: DisplayConfig['layout']): React.CSSProperties {
  switch (layout) {
    case 'fullscreen':     return { display: 'grid', gridTemplateColumns: '1fr',         gridTemplateRows: '1fr' }
    case 'split_h':        return { display: 'grid', gridTemplateColumns: '1fr 1fr',     gridTemplateRows: '1fr' }
    case 'split_v':        return { display: 'grid', gridTemplateColumns: '1fr',         gridTemplateRows: '1fr 1fr' }
    case 'main_sidebar':   return { display: 'grid', gridTemplateColumns: '2fr 1fr',     gridTemplateRows: '1fr' }
    case 'sidebar_main':   return { display: 'grid', gridTemplateColumns: '1fr 2fr',     gridTemplateRows: '1fr' }
    case 'thirds':         return { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr' }
    case 'main_two_right': return { display: 'grid', gridTemplateColumns: '2fr 1fr',     gridTemplateRows: '1fr 1fr' }
    case 'two_left_main':  return { display: 'grid', gridTemplateColumns: '1fr 2fr',     gridTemplateRows: '1fr 1fr' }
    case 'main_top_two':   return { display: 'grid', gridTemplateColumns: '1fr 1fr',     gridTemplateRows: '2fr 1fr' }
    case 'two_top_main':   return { display: 'grid', gridTemplateColumns: '1fr 1fr',     gridTemplateRows: '1fr 2fr' }
    case 'three_rows':     return { display: 'grid', gridTemplateColumns: '1fr',         gridTemplateRows: '1fr 1fr 1fr' }
    case 'four_quad':      return { display: 'grid', gridTemplateColumns: '1fr 1fr',     gridTemplateRows: '1fr 1fr' }
  }
}

function zoneStyle(layout: DisplayConfig['layout'], index: number): React.CSSProperties {
  // main_two_right: zone 0 (left main) spans both rows
  if (layout === 'main_two_right' && index === 0) return { gridRow: '1 / 3' }
  // two_left_main: zone 2 (right main) spans both rows
  if (layout === 'two_left_main'  && index === 2) return { gridColumn: '2', gridRow: '1 / 3' }
  // main_top_two: zone 0 (top main) spans both columns
  if (layout === 'main_top_two'   && index === 0) return { gridColumn: '1 / 3' }
  // two_top_main: zone 2 (bottom main) spans both columns
  if (layout === 'two_top_main'   && index === 2) return { gridColumn: '1 / 3' }
  return {}
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
      return <BracketZone bracket={data.bracket} config={config as Extract<ZoneConfig, { type: 'bracket' }>} theme={theme} timezone={data.timezone} />
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
    case 'sponsors':
      return <SponsorsZone sponsors={data.sponsors} theme={theme} />
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

  // Auto-refresh: re-render server component to get fresh data
  useEffect(() => {
    const secs = Math.max(10, config.refresh_seconds ?? 30)
    const id = setInterval(() => router.refresh(), secs * 1000)
    return () => clearInterval(id)
  }, [config.refresh_seconds, router])

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
              ...zoneStyle(config.layout, i),
              borderRight:  needsRightBorder(config.layout, i) ? `1px solid ${border}` : undefined,
              borderBottom: needsBottomBorder(config.layout, i) ? `1px solid ${border}` : undefined,
            }}
          >
            <ZoneRenderer config={zone} data={data} theme={config.theme} />
          </div>
        ))}
      </div>

      {/* Sponsor banner — bottom (default) */}
      {showBanner && banner!.position !== 'top' && bannerEl}

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

function needsRightBorder(layout: DisplayConfig['layout'], index: number): boolean {
  switch (layout) {
    case 'split_h':        return index === 0
    case 'main_sidebar':   return index === 0
    case 'sidebar_main':   return index === 0
    case 'thirds':         return index < 2
    case 'main_two_right': return index === 0
    case 'two_left_main':  return index === 0 || index === 1
    case 'main_top_two':   return index === 1
    case 'two_top_main':   return index === 0
    case 'four_quad':      return index % 2 === 0
    default: return false
  }
}

function needsBottomBorder(layout: DisplayConfig['layout'], index: number): boolean {
  switch (layout) {
    case 'split_v':        return index === 0
    case 'main_two_right': return index === 1
    case 'two_left_main':  return index === 0
    case 'main_top_two':   return index === 0
    case 'two_top_main':   return index === 0 || index === 1
    case 'three_rows':     return index === 0 || index === 1
    case 'four_quad':      return index < 2
    default: return false
  }
}
