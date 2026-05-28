'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { DisplayGame } from '@/lib/display-types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(new Date(iso))
}

function fmtDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
  }).format(new Date(iso))
}

// Group key: minute-precision bucket so simultaneous games share a slot header
function slotKey(iso: string) {
  return iso.slice(0, 16) // "YYYY-MM-DDTHH:MM"
}

// ── Team badge: logo image → color dot → nothing ──────────────────────────────
function TeamBadge({ logoUrl, color, name }: { logoUrl: string | null; color: string | null; name: string }) {
  const [imgError, setImgError] = useState(false)

  if (logoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        onError={() => setImgError(true)}
        style={{
          width: 18, height: 18, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
          border: '1px solid rgba(128,128,128,0.2)',
        }}
      />
    )
  }
  if (color) {
    return (
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: color, flexShrink: 0,
      }} />
    )
  }
  return null
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Slot {
  key:       string
  slotGames: DisplayGame[]
  timeLabel: string
  dateLabel: string | null
  isPast:    boolean
  isCurrent: boolean
  isFuture:  boolean
  isNext:    boolean
}

// px/s for each named speed; auto derives from content height
const SPEED_PX_PER_S: Record<string, number> = {
  slow:   20,
  normal: 40,
  fast:   75,
}

interface Props {
  games:       DisplayGame[]
  timezone:    string
  isDark:      boolean
  scrollSpeed: 'slow' | 'normal' | 'fast' | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleClient({ games, timezone, isDark, scrollSpeed }: Props) {
  const [now, setNow]               = useState(() => new Date())
  const [shouldScroll, setShouldScroll] = useState(false)
  const outerRef  = useRef<HTMLDivElement>(null)
  const singleRef = useRef<HTMLDivElement>(null)

  // Refresh "now" every 30 s so slot statuses stay accurate
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Detect content overflow → enable scroll
  useEffect(() => {
    const outer  = outerRef.current
    const single = singleRef.current
    if (!outer || !single) return

    const check = () => {
      setShouldScroll((single.scrollHeight ?? 0) > (outer.clientHeight ?? 0))
    }
    check()
    const obs = new ResizeObserver(check)
    obs.observe(outer)
    obs.observe(single)
    return () => obs.disconnect()
  }, [])

  // ── Group games into time slots ───────────────────────────────────────────────

  const slots: Slot[] = useMemo(() => {
    const uniqueDates = new Set(games.map(g => g.scheduled_at.slice(0, 10)))
    const multiDay    = uniqueDates.size > 1

    const map = new Map<string, DisplayGame[]>()
    for (const g of games) {
      const k = slotKey(g.scheduled_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(g)
    }

    const raw = [...map.entries()].map(([k, slotGames]) => {
      const slotTime = new Date(slotGames[0].scheduled_at)
      const diffMin  = (now.getTime() - slotTime.getTime()) / 60_000

      const allDone  = slotGames.every(g =>
        g.result_status === 'confirmed' ||
        g.game_status   === 'cancelled' ||
        g.game_status   === 'postponed'
      )

      // Past: all scored/cancelled, or started >3 h ago (assume forgotten)
      const isPast    = allDone || diffMin > 180
      const isCurrent = !isPast && diffMin >= 0   // started, not done
      const isFuture  = !isPast && diffMin < 0    // hasn't started yet

      return {
        key:       k,
        slotGames,
        timeLabel: fmtTime(slotGames[0].scheduled_at, timezone),
        dateLabel: multiDay ? fmtDate(slotGames[0].scheduled_at, timezone) : null,
        isPast, isCurrent, isFuture,
        isNext: false,
      }
    })

    // First future slot = "Up Next"
    let hitNext = false
    return raw.map(s => {
      if (!hitNext && s.isFuture) { hitNext = true; return { ...s, isNext: true } }
      return s
    })
  }, [games, now, timezone])

  // Scroll duration: named speed → fixed px/s; null → auto (content-based)
  const estimatedH = games.length * 38 + slots.length * 26
  const pxPerSec   = scrollSpeed ? (SPEED_PX_PER_S[scrollSpeed] ?? 40) : 40
  const scrollDuration = Math.max(15, estimatedH / pxPerSec)

  // ── Theme tokens ──────────────────────────────────────────────────────────────

  // Only render the court column when at least one visible game has a court value
  const hasCourts = games.some(g => g.court)

  const bg       = isDark ? '#18181b' : '#ffffff'
  const border   = isDark ? '#3f3f46' : '#e5e7eb'
  const hdrBg    = isDark ? '#27272a' : '#f3f4f6'
  const hdrText  = isDark ? '#a1a1aa' : '#6b7280'
  const teamFull = isDark ? '#e4e4e7' : '#111827'
  const teamDim  = isDark ? '#71717a' : '#9ca3af'
  const currBg   = isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)'
  const nextBg   = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)'

  // ── Render slot list ──────────────────────────────────────────────────────────

  const renderSlots = () => slots.map((slot) => {
    const { key, slotGames, timeLabel, dateLabel, isPast, isCurrent, isNext } = slot

    return (
      <div key={key}>

        {/* ── Time group header ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 14px',
          backgroundColor: hdrBg,
          borderTop: `1px solid ${border}`,
          borderBottom: `1px solid ${border}`,
        }}>
          {isCurrent && (
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 0 3px rgba(16,185,129,0.25)',
              flexShrink: 0,
            }} />
          )}
          <span style={{
            fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: hdrText,
          }}>
            {dateLabel ? `${dateLabel} · ` : ''}{timeLabel}
          </span>
          {isCurrent && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#10b981', marginLeft: 2 }}>
              · In Progress
            </span>
          )}
          {isNext && (
            <span style={{ fontSize: 10, fontWeight: 600, color: hdrText, marginLeft: 2 }}>
              · Up Next
            </span>
          )}
        </div>

        {/* ── Games in this slot ────────────────────────────────────────── */}
        {slotGames.map((g) => {
          const isComplete  = g.result_status === 'confirmed'
          const isCancelled = g.game_status   === 'cancelled'
          const isPostponed = g.game_status   === 'postponed'
          const muted       = isPast

          // Winner emphasis only for non-past completed games
          const showWinner  = !isPast && isComplete
          const homeWins    = isComplete && g.home_score !== null && g.away_score !== null && g.home_score > g.away_score
          const awayWins    = isComplete && g.home_score !== null && g.away_score !== null && g.away_score > g.home_score
          const homeColor   = showWinner ? (homeWins ? teamFull : teamDim) : teamFull
          const awayColor   = showWinner ? (awayWins ? teamFull : teamDim) : teamFull

          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center',
              padding: '7px 14px', gap: 10,
              borderBottom: `1px solid ${border}`,
              backgroundColor: isCurrent ? currBg : isNext ? nextBg : 'transparent',
              opacity: muted ? 0.38 : 1,
            }}>

              {/* Court — only rendered when at least one game has a court */}
              {hasCourts && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isDark ? '#a1a1aa' : '#4b5563',
                  backgroundColor: isDark ? '#27272a' : '#f3f4f6',
                  border: `1px solid ${border}`,
                  borderRadius: 4,
                  padding: '1px 6px',
                  minWidth: 60, flexShrink: 0,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 80,
                }}>
                  {g.court ?? '—'}
                </span>
              )}

              {/* Home team */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <TeamBadge logoUrl={g.home_logo_url} color={g.home_color} name={g.home_name} />
                <span style={{
                  fontWeight: 600, fontSize: 13, lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: homeColor,
                }}>
                  {g.home_name}
                </span>
              </div>

              {/* Score / VS / status badge */}
              <div style={{ width: 88, textAlign: 'center', flexShrink: 0 }}>
                {isCancelled ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    padding: '2px 5px', borderRadius: 3,
                  }}>
                    CANCELLED
                  </span>
                ) : isPostponed ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.12)',
                    padding: '2px 5px', borderRadius: 3,
                  }}>
                    POSTPONED
                  </span>
                ) : isComplete ? (
                  <span style={{
                    fontSize: 16, fontWeight: 800,
                    color: teamFull, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {g.home_score}&thinsp;–&thinsp;{g.away_score}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: teamDim }}>vs</span>
                )}
              </div>

              {/* Away team */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: 'flex-end', minWidth: 0,
              }}>
                <span style={{
                  fontWeight: 600, fontSize: 13, lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textAlign: 'right',
                  color: awayColor,
                }}>
                  {g.away_name}
                </span>
                <TeamBadge logoUrl={g.away_logo_url} color={g.away_color} name={g.away_name} />
              </div>

            </div>
          )
        })}
      </div>
    )
  })

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {shouldScroll && (
        <style>{`
          @keyframes sched-scroll {
            from { transform: translateY(0); }
            to   { transform: translateY(-50%); }
          }
        `}</style>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* ── Column headers ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '5px 14px', gap: 10,
          flexShrink: 0,
          borderBottom: `1px solid ${border}`,
          backgroundColor: hdrBg,
        }}>
          {hasCourts && (
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: hdrText,
              minWidth: 60, maxWidth: 80, flexShrink: 0, textAlign: 'center',
            }}>
              Court
            </span>
          )}
          <span style={{
            flex: 1, fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', color: hdrText,
          }}>
            Home
          </span>
          <span style={{
            width: 88, flexShrink: 0, textAlign: 'center',
            fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', color: hdrText,
          }}>
            Score
          </span>
          <span style={{
            flex: 1, textAlign: 'right',
            fontSize: 9, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', color: hdrText,
          }}>
            Away
          </span>
        </div>

        {/* ── Scrolling content ───────────────────────────────────────────── */}
        <div ref={outerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>

          {/* Gradient fades hint that more content exists */}
          {shouldScroll && (
            <>
              <div style={{
                position: 'absolute', inset: '0 0 auto 0', height: 28, zIndex: 10,
                background: `linear-gradient(to bottom, ${bg}, transparent)`,
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', inset: 'auto 0 0 0', height: 28, zIndex: 10,
                background: `linear-gradient(to top, ${bg}, transparent)`,
                pointerEvents: 'none',
              }} />
            </>
          )}

          {/* Scrolling wrapper — content duplicated for seamless loop */}
          <div style={shouldScroll ? {
            animation: `sched-scroll ${scrollDuration}s linear infinite`,
            willChange: 'transform',
          } : undefined}>
            <div ref={singleRef}>{renderSlots()}</div>
            {shouldScroll && <div aria-hidden="true">{renderSlots()}</div>}
          </div>

        </div>

      </div>
    </>
  )
}
