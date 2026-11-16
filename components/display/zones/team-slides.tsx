'use client'

import type { CSSProperties } from 'react'
import type { DisplayMatchup, DisplayTeamCard } from '@/lib/display-types'
import { readableTextOn } from '@/lib/contrast'
import { teamColor, teamInitials, teamMetaLine, recordLabel } from '@/lib/team-cards'

/**
 * Broadcast-style team graphics for the showcase zone's 'teams' source:
 * a team intro (colour slab, logo, name, pool/place/record strip, roster
 * lineup) and an "Up next" matchup split. Sized with container units
 * (cqmin) so the same slide reads on a full screen or a sidebar zone.
 * Every animated element carries `showcase-anim`, which the zone turns off
 * under prefers-reduced-motion.
 */

const HEADING: CSSProperties = { fontFamily: 'var(--brand-heading-font)' }
const rise = (delayS: number, durS = 0.6): CSSProperties => ({ animation: `showcase-chyron ${durS}s cubic-bezier(.2,.8,.2,1) ${delayS}s both` })
/**
 * Font size for a team name that must fit `widthCqw` of the slide without
 * breaking a word: capped at `maxCqmin`, shrunk for the longest word.
 */
function nameSize(name: string, widthCqw: number, maxCqmin: number): string {
  const longest = Math.max(4, ...name.split(/\s+/).map((w) => w.length))
  return `min(${maxCqmin}cqmin, ${(widthCqw / (longest * 0.72)).toFixed(2)}cqw)`
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase()
}

const wipe = (delayS: number): CSSProperties => ({ animation: `team-wipe .7s cubic-bezier(.7,0,.2,1) ${delayS}s both` })

export const TEAM_SLIDE_KEYFRAMES = `
  @keyframes team-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes team-slab { from { transform: translateX(-12%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes team-vs { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
`

function TeamDisc({ team, sizeCq, ring }: { team: Pick<DisplayTeamCard, 'name' | 'color' | 'logoUrl'>; sizeCq: number; ring: string }) {
  const color = teamColor(team)
  const size = `${sizeCq}cqmin`
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_1.2cqmin_3cqmin_rgba(0,0,0,.45)]"
      style={{ width: size, height: size, boxShadow: `0 0 0 ${sizeCq * 0.04}cqmin ${ring}, 0 1.2cqmin 3cqmin rgba(0,0,0,.45)` }}
    >
      {team.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote team logo on the TV
        <img src={team.logoUrl} alt="" className="h-[82%] w-[82%] object-contain" />
      ) : (
        <span className="font-black leading-none" style={{ ...HEADING, color, fontSize: `${sizeCq * 0.38}cqmin` }}>
          {teamInitials(team.name)}
        </span>
      )}
    </span>
  )
}

/** Diagonal pinstripes for broadcast texture. */
const STRIPES: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,.06) 0 2px, transparent 2px 14px)',
}

export function TeamIntroSlide({ team }: { team: DisplayTeamCard }) {
  const color = teamColor(team)
  const on = readableTextOn(color)
  const meta = teamMetaLine(team)
  const roster = team.roster
  const twoCols = roster.length > 8
  const shown = roster.slice(0, 16)
  const more = roster.length - shown.length
  const rowSize = twoCols ? 3.6 : 4.4

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d12] text-white" style={{ containerType: 'size' }}>
      {/* White edge along the cut: the same shape, a touch wider, behind the slab */}
      <div
        className="showcase-anim absolute inset-y-0 left-0 w-[47.2%] bg-white/85"
        style={{ clipPath: 'polygon(0 0, 100% 0, 82.4% 100%, 0 100%)', animation: 'team-slab .7s cubic-bezier(.2,.8,.2,1) .08s both' }}
      />
      {/* Colour slab, cut on the diagonal */}
      <div
        className="showcase-anim absolute inset-y-0 left-0 w-[46%]"
        style={{
          background: `linear-gradient(160deg, ${color} 0%, ${color} 55%, color-mix(in srgb, ${color} 70%, black) 100%)`,
          clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)',
          animation: 'team-slab .7s cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        <div className="absolute inset-0" style={STRIPES} />
        {/* Watermark initials */}
        <span
          aria-hidden
          className="absolute -bottom-[6cqmin] -left-[3cqmin] select-none font-black leading-none"
          style={{ ...HEADING, fontSize: '46cqmin', color: on, opacity: 0.08 }}
        >
          {teamInitials(team.name)}
        </span>
      </div>

      {/* Identity */}
      <div className="absolute inset-y-0 left-0 flex w-[40%] flex-col justify-center gap-[3cqmin] pl-[6cqmin] pr-[2cqmin]" style={{ color: on }}>
        <p className="showcase-anim font-mono uppercase tracking-[.3em]" style={{ ...rise(0.2), fontSize: '2.4cqmin', opacity: 0.85 }}>
          Team intro
        </p>
        <span className="showcase-anim" style={rise(0.3)}>
          <TeamDisc team={team} sizeCq={24} ring={on === '#ffffff' ? 'rgba(255,255,255,.9)' : 'rgba(17,24,39,.85)'} />
        </span>
        <h2
          className="showcase-anim font-black uppercase leading-[.92]"
          style={{ ...HEADING, ...rise(0.45, 0.7), fontSize: nameSize(team.name, 34, team.name.length > 16 ? 7.5 : 9.5) }}
        >
          {team.name}
        </h2>
        {meta.length > 0 && (
          <div className="showcase-anim flex flex-wrap items-stretch" style={wipe(0.7)}>
            {meta.map((bit, i) => (
              <span
                key={bit}
                className="font-mono font-bold uppercase tracking-[.12em]"
                style={{
                  fontSize: '2.8cqmin',
                  padding: '1cqmin 2cqmin',
                  background: i === 0 ? on : 'rgba(0,0,0,.28)',
                  color: i === 0 ? color : on,
                }}
              >
                {bit}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Roster */}
      <div className="absolute inset-y-0 right-0 flex w-[56%] flex-col justify-center py-[5cqmin] pl-[4cqmin] pr-[5cqmin]">
        <div className="showcase-anim mb-[2.5cqmin] flex items-center gap-[2cqmin]" style={rise(0.5)}>
          <span className="h-[0.6cqmin] w-[6cqmin]" style={{ background: color === '#ffffff' ? '#e5e7eb' : color }} />
          <span className="font-mono uppercase tracking-[.3em] text-white/75" style={{ fontSize: '2.4cqmin' }}>
            {roster.length > 0 ? 'The lineup' : 'Roster to come'}
          </span>
        </div>
        <ul className={twoCols ? 'grid grid-cols-2 gap-x-[3cqmin]' : 'flex flex-col'}>
          {shown.map((p, i) => (
            <li
              key={`${p.name}-${i}`}
              className="showcase-anim flex min-w-0 items-center gap-[2cqmin] border-b border-white/10"
              style={{ ...rise(0.6 + i * 0.06, 0.5), paddingBlock: `${rowSize * 0.22}cqmin` }}
            >
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- opted-in player photo
                <img src={p.photoUrl} alt="" className="shrink-0 rounded-full object-cover ring-2 ring-white/60"
                     style={{ width: `${rowSize * 1.15}cqmin`, height: `${rowSize * 1.15}cqmin` }} />
              ) : (
                <span
                  className="flex shrink-0 items-center justify-center font-mono font-bold tabular-nums"
                  style={{
                    width: `${rowSize * 1.15}cqmin`, height: `${rowSize * 1.15}cqmin`,
                    background: p.role === 'coach' ? 'rgba(255,255,255,.12)' : color,
                    color: p.role === 'coach' ? '#fff' : on,
                    fontSize: `${rowSize * 0.5}cqmin`,
                    clipPath: 'polygon(12% 0, 100% 0, 88% 100%, 0 100%)',
                  }}
                >
                  {p.role === 'coach' ? 'HC' : (p.number ?? initialsOf(p.name))}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold uppercase leading-tight" style={{ ...HEADING, fontSize: `${rowSize * 0.62}cqmin` }}>
                  {p.photoUrl && p.number ? <span className="mr-[1cqmin] font-mono text-white/60">#{p.number}</span> : null}
                  {p.name}
                  {p.role === 'captain' && (
                    <span className="ml-[1.2cqmin] inline-block bg-amber-400 align-middle font-black text-amber-950"
                          style={{ fontSize: `${rowSize * 0.36}cqmin`, padding: `${rowSize * 0.06}cqmin ${rowSize * 0.2}cqmin`, lineHeight: 1.2 }}
                          title="Captain">
                      C
                    </span>
                  )}
                </span>
                {(p.position || p.role === 'coach') && (
                  <span className="block truncate uppercase tracking-[.14em] text-white/60" style={{ fontSize: `${rowSize * 0.34}cqmin` }}>
                    {p.role === 'coach' ? 'Coach' : p.position}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <p className="mt-[1.5cqmin] font-mono uppercase tracking-[.2em] text-white/55" style={{ fontSize: '2.2cqmin' }}>
            + {more} more
          </p>
        )}
      </div>
    </div>
  )
}

export function MatchupSlide({
  matchup, home, away, timeLabel,
}: {
  matchup: DisplayMatchup
  home: DisplayTeamCard | undefined
  away: DisplayTeamCard | undefined
  timeLabel: string
}) {
  const h = home ?? { name: 'Home', color: null, logoUrl: null, played: 0, won: 0, lost: 0, drawn: 0, poolName: null, rank: null }
  const a = away ?? { name: 'Away', color: null, logoUrl: null, played: 0, won: 0, lost: 0, drawn: 0, poolName: null, rank: null }
  const hc = teamColor(h)
  const ac = teamColor(a)

  const side = (t: typeof h, color: string, align: 'left' | 'right', delay: number) => {
    const on = readableTextOn(color)
    const record = recordLabel(t)
    return (
      <div
        className={`absolute inset-y-0 flex w-1/2 flex-col items-center justify-center gap-[3cqmin] px-[7cqmin] text-center ${align === 'left' ? 'left-0' : 'right-0'}`}
        style={{ color: on }}
      >
        <span className="showcase-anim" style={rise(delay)}>
          <TeamDisc team={t} sizeCq={26} ring={on === '#ffffff' ? 'rgba(255,255,255,.9)' : 'rgba(17,24,39,.85)'} />
        </span>
        <p className="showcase-anim font-black uppercase leading-[.95]"
           style={{ ...HEADING, ...rise(delay + 0.15, 0.7), fontSize: nameSize(t.name, 38, t.name.length > 16 ? 6 : 8) }}>
          {t.name}
        </p>
        {(record || t.poolName) && (
          <p className="showcase-anim font-mono font-bold uppercase tracking-[.16em]"
             style={{ ...rise(delay + 0.3), fontSize: '2.8cqmin', padding: '0.8cqmin 2cqmin', background: 'rgba(0,0,0,.28)' }}>
            {[t.poolName, record].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d12] text-white" style={{ containerType: 'size' }}>
      <div className="showcase-anim absolute inset-0"
           style={{ background: hc, clipPath: 'polygon(0 0, 56% 0, 44% 100%, 0 100%)', animation: 'team-slab .7s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="absolute inset-0" style={STRIPES} />
      </div>
      <div className="showcase-anim absolute inset-0"
           style={{ background: ac, clipPath: 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)', animation: 'team-slab .7s cubic-bezier(.2,.8,.2,1) .1s both' }}>
        <div className="absolute inset-0" style={STRIPES} />
      </div>
      {/* Shade toward the bottom so the info bar sits on something calm */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/35" />

      {side(h, hc, 'left', 0.3)}
      {side(a, ac, 'right', 0.45)}

      {/* VS */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span
          className="showcase-anim flex items-center justify-center rounded-full bg-[#0b0d12] font-black italic text-white ring-[0.8cqmin] ring-white"
          style={{ ...HEADING, width: '15cqmin', height: '15cqmin', fontSize: '6cqmin', animation: 'team-vs .6s cubic-bezier(.2,.8,.2,1) .7s both' }}
        >
          VS
        </span>
      </div>

      {/* Top tag */}
      <div className="absolute left-1/2 top-[4cqmin] -translate-x-1/2">
        <p className="showcase-anim bg-white font-mono font-bold uppercase tracking-[.3em] text-[#0b0d12]"
           style={{ ...wipe(0.2), fontSize: '2.6cqmin', padding: '1cqmin 3cqmin' }}>
          Up next
        </p>
      </div>

      {/* Info bar */}
      <div className="showcase-anim absolute inset-x-[6cqmin] bottom-[4cqmin] flex flex-wrap items-stretch justify-center" style={wipe(0.9)}>
        <span className="bg-white font-black uppercase text-[#0b0d12]" style={{ ...HEADING, fontSize: '3.6cqmin', padding: '1cqmin 3cqmin' }}>
          {timeLabel}
        </span>
        {matchup.court && (
          <span className="bg-[#0b0d12]/85 font-black uppercase" style={{ ...HEADING, fontSize: '3.6cqmin', padding: '1cqmin 3cqmin' }}>
            Court {matchup.court}
          </span>
        )}
        {matchup.headToHead && (
          <span className="bg-black/60 font-mono uppercase tracking-[.1em] text-white/85"
                style={{ fontSize: '2.4cqmin', padding: '1.6cqmin 2.5cqmin', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
            {matchup.headToHead}
          </span>
        )}
      </div>
    </div>
  )
}
