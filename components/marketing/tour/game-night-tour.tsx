'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import type { TourFonts } from './tour-engine'
import './tour.css'

// The chapter copy is real DOM text (crawlable, screen-reader friendly); the
// 3D run behind it is decoration, so the canvas is aria-hidden and the page
// still reads top to bottom without WebGL.

interface Chapter {
  venue: string
  label: string
  accent: string
  title: [string, string]
  copy: string
  chips: string[]
}

const CHAPTERS: Chapter[] = [
  {
    venue: 'gate', label: 'Doors open', accent: '#22d39a',
    title: ['Roster full.', 'Paperwork zero.'],
    copy: 'Players register and sign waivers online — or scan a QR code at the door. Your roster fills itself while you set up the nets.',
    chips: ['Online registration', 'QR waivers', 'Team codes'],
  },
  {
    venue: 'volleyball', label: 'Volleyball', accent: '#7cd8ff',
    title: ['Tap. Point.', 'Set.'],
    copy: 'The free Fieldday scoreboard turns any phone into a courtside board. Tap to score, swipe to fix a mistake, and the final saves straight to your standings.',
    chips: ['Free scoreboard', 'Works offline', 'Live on the gym TV'],
  },
  {
    venue: 'soccer', label: 'Soccer', accent: '#8fe6a8',
    title: ['The whole season.', 'In minutes.'],
    copy: 'Round robins, fields, time slots, byes and breaks — generated in minutes. Drop-in sessions and season passes sit right alongside.',
    chips: ['Schedule builder', 'Field assignments', 'Drop-ins'],
  },
  {
    venue: 'basketball', label: 'Basketball', accent: '#ffa53d',
    title: ['Standings that', 'update themselves.'],
    copy: 'One captain submits, the other confirms, the table moves. Streaks, player stats and leaderboards — no spreadsheet at midnight.',
    chips: ['Two-captain confirm', 'Player stats', 'Win streaks'],
  },
  {
    venue: 'beach', label: 'Beach volleyball', accent: '#ffc56b',
    title: ['E-transfer?', 'Sorted.'],
    copy: 'Stripe, e-transfer and cash in one ledger, with GST, PST or HST on every charge. Fieldday takes no cut of your registrations.',
    chips: ['E-transfer tracking', 'GST / PST / HST', 'Tax reports'],
  },
  {
    venue: 'hockey', label: 'Hockey', accent: '#9fd8ff',
    title: ['Win or', 'go home.'],
    copy: 'Gold and Silver tiers, single or double elimination, or a bracket you draw yourself. First-round losers can drop into the next tier.',
    chips: ['Tiered playoffs', 'Double elimination', 'Custom brackets'],
  },
  {
    venue: 'podium', label: 'The podium', accent: '#ffc84a',
    title: ['Forever', 'on the wall.'],
    copy: 'Champions earn medals, podiums and banners in a public Hall of Champions — and every player gets a trading card with their career stats.',
    chips: ['Medals', 'Hall of Champions', 'Player cards'],
  },
]

const PLANS = [
  ['$0', 'Free'],
  ['$39', 'Starter'],
  ['$89', 'Pro'],
  ['$179', 'Club'],
] as const

const TOTAL = CHAPTERS.length + 2
const pad = (n: number) => String(n).padStart(2, '0')
const accent = (hex: string) => ({ '--accent': hex }) as CSSProperties

export function GameNightTour({ fonts, className }: { fonts: TourFonts; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let stop: (() => void) | undefined
    let cancelled = false
    import('./tour-engine').then(({ startTour }) => {
      if (!cancelled) stop = startTour(root, fonts)
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [fonts])

  return (
    <div ref={rootRef} className={`fd-tour ${className ?? ''}`} data-hero="">
      <canvas className="scene" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <header className="hud">
        <Link className="brand" href="/" aria-label="Fieldday home">
          <span className="brand-mark" aria-hidden="true" />
          FIELDDAY
        </Link>
        <div className="meter" aria-hidden="true">
          <span className="meter-label"><b>01</b> / {pad(TOTAL)} · The tunnel</span>
          <span className="meter-bar"><span className="meter-fill" /></span>
        </div>
      </header>

      <div className="play-dock">
        <button className="btn btn-ghost" data-tour-play="dock" type="button">
          <span className="tri" aria-hidden="true" />
          <span className="lbl">Play the tour</span>
        </button>
      </div>

      <main className="track">
        <section className="chapter hero" data-venue="tunnel" data-label="The tunnel" style={accent('#22d39a')}>
          <div className="hero-inner">
            <p className="kicker">Rec league software · Built in Canada</p>
            <h1>Game<br /><span className="stroke">night.</span></h1>
            <p className="lede">
              Sign-ups, payments, schedules, scores and trophies for every rec league — run from one app.
              Scroll to take the field.
            </p>
            <div className="actions">
              <button className="btn btn-ghost" data-tour-play="hero" type="button">
                <span className="tri" aria-hidden="true" />
                Play the tour
              </button>
              <Link className="btn btn-primary" href="/signup">Start free trial</Link>
            </div>
            <p className="fine">15-day free trial · No credit card required</p>
            <div className="cue" aria-hidden="true"><span className="cue-line" />Scroll to run</div>
          </div>
        </section>

        {CHAPTERS.map((c, i) => (
          <section key={c.venue} className="chapter" data-venue={c.venue} data-label={c.label} style={accent(c.accent)}>
            <div className="card">
              <p className="eyebrow"><span className="dot" /><span className="num">{pad(i + 2)}</span> {c.label}</p>
              <h2>{c.title[0]} <em>{c.title[1]}</em></h2>
              <p className="copy">{c.copy}</p>
              <ul className="chips">{c.chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
            </div>
          </section>
        ))}

        <section className="chapter finale" data-venue="finale" data-label="Your league" style={accent('#22d39a')}>
          <div className="card">
            <p className="eyebrow"><span className="dot" /><span className="num">{pad(TOTAL)}</span> Your league</p>
            <h2>Your league. <em>Your site. Tonight.</em></h2>
            <p className="copy">
              Every league gets its own branded website — schedules, standings, galleries and sign-ups in your
              colours. Start free. Priced in Canadian dollars.
            </p>
            <div className="plans" aria-label="Plans, per month in CAD">
              {PLANS.map(([price, name]) => (
                <div key={name} className="plan"><b>{price}</b><span>{name}</span></div>
              ))}
            </div>
            <div className="actions">
              <Link className="btn btn-primary" href="/signup">Start free trial</Link>
              <Link className="btn btn-ghost" href="/scoreboard">Try the free scoreboard</Link>
            </div>
            <p className="fine">15-day free trial · No credit card required</p>
          </div>
        </section>
      </main>
    </div>
  )
}
