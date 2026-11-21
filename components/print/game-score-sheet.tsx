import type React from 'react'
import QRCode from 'react-qr-code'
import { type ScoreStructure } from '@/lib/print-config'
import { formatGameTime } from '@/lib/format-time'

interface Game {
  id: string
  /** Null = not scheduled yet: blank Date / Time / Court lines to fill in. */
  scheduledAt: string | null
  court: string | null
  weekNumber: number | null
  /** Null (or 'TBD') = not known yet: a line to write the team in. */
  homeTeamName: string | null
  awayTeamName: string | null
  /** Faint reminder under a write-in line ("Seed 3", "Winner of QF Match 2"). */
  homeHint?: string | null
  awayHint?: string | null
  /** Team colours (#rrggbb) for the stripe under each name. */
  homeColor?: string | null
  awayColor?: string | null
  /** Team logos — shown under the name instead of the colour stripe. */
  homeLogoUrl?: string | null
  awayLogoUrl?: string | null
  /** Played and scored but excluded from the standings. */
  isExhibition?: boolean
}

interface Props {
  game: Game
  scoreStructure: ScoreStructure
  leagueName: string
  orgName: string
  timezone: string
  /** Absolute link a phone opens from the QR code (`/score/<gameId>`); no QR without it. */
  scanUrl?: string
  /** Playoff cards: the coloured tier · stage · match banner across the top. */
  matchBanner?: MatchBanner
}

export interface MatchBanner {
  tier: string
  tierColor: string
  stage: string
  stageColor: string
  matchNumber: number
}

/** Colours must survive printing (browsers drop backgrounds by default). */
const KEEP_COLOUR: React.CSSProperties = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }

function Banner({ b }: { b: MatchBanner }) {
  return (
    <div data-keep-colour className="flex items-stretch gap-2 mb-3 text-white" style={KEEP_COLOUR}>
      <div data-keep-colour className="flex-1 min-w-0 rounded-lg px-4 py-2 flex flex-col justify-center" style={{ backgroundColor: b.tierColor, ...KEEP_COLOUR }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">Bracket</p>
        <p className="text-[28px] font-black uppercase leading-none break-words">{b.tier}</p>
      </div>
      <div data-keep-colour className="flex-1 min-w-0 rounded-lg px-4 py-2 flex flex-col justify-center" style={{ backgroundColor: b.stageColor, ...KEEP_COLOUR }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">Stage</p>
        <p className="text-[22px] font-extrabold uppercase leading-tight break-words">{b.stage}</p>
      </div>
      <div data-keep-colour className="shrink-0 w-24 rounded-lg border-[3px] border-black bg-white text-black flex flex-col items-center justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Match</p>
        <p className="text-[40px] font-black leading-none">{b.matchNumber}</p>
      </div>
    </div>
  )
}

/**
 * Schedule sheets: where and when, big, in the org's brand colour — the two
 * things a volunteer looks for when the sheets are handed out court by court.
 */
function GameBanner({ court, date, time }: { court: string | null; date: string | null; time: string | null }) {
  const fill: React.CSSProperties = { backgroundColor: 'var(--brand-primary, #047857)', color: 'var(--brand-on-primary, #fff)', ...KEEP_COLOUR }
  return (
    <div data-keep-colour className="flex items-stretch gap-2 mb-3" style={KEEP_COLOUR}>
      <div data-keep-colour className="shrink-0 min-w-[9rem] rounded-lg px-4 py-2 flex flex-col justify-center" style={fill}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">Court</p>
        {court
          ? <p className="text-[34px] font-black leading-none break-words">{court}</p>
          : <span className="block mt-3 h-6 border-b-2 border-current opacity-80" aria-label="Write the court here" />}
      </div>
      <div data-keep-colour className="flex-1 min-w-0 rounded-lg px-4 py-2 flex flex-col justify-center bg-gray-900 text-white" style={{ backgroundColor: '#111827', ...KEEP_COLOUR }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{date ?? 'Date & time'}</p>
        {time
          ? <p className="text-[28px] font-extrabold leading-none">{time}</p>
          : <span className="block mt-3 h-6 border-b-2 border-white/70" aria-label="Write the time here" />}
      </div>
    </div>
  )
}

/**
 * Under each team name, so a sheet is told apart at a glance: the team's logo
 * when it has one, else a stripe in its colour, else nothing.
 */
function TeamMark({ color, logoUrl }: { color?: string | null; logoUrl?: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- print sheet: a plain image prints reliably
    return <img src={logoUrl} alt="" className="block mx-auto mt-1.5 h-12 max-w-[7rem] object-contain" style={KEEP_COLOUR} />
  }
  if (!color) return null
  return <span data-keep-colour className="block mx-auto mt-1.5 h-2 w-24 rounded-full" style={{ backgroundColor: color, ...KEEP_COLOUR }} aria-hidden />
}

const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null)
const safeLogo = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : null)
const isUnknown = (n: string | null | undefined) => !n || /^tbd$/i.test(n.trim())

/**
 * One grid for the team names and every score row — Home column, a narrow
 * label column, Away column — so each box sits straight under its team.
 */
const COLS = 'grid grid-cols-[1fr_5.5rem_1fr] items-center gap-x-3'

function Box({ big }: { big?: boolean }) {
  return <span className={`block mx-auto border-2 border-black rounded ${big ? 'w-28 h-14' : 'w-24 h-11'}`} />
}

function ScoreRow({ label, total }: { label: string; total?: boolean }) {
  return (
    <div className={`${COLS} py-1.5 ${total ? 'mt-1 pt-2.5 border-t-2 border-black' : 'border-b border-gray-200'}`}>
      <Box big={total} />
      <span className={`text-center ${total ? 'text-sm font-extrabold' : 'text-xs font-semibold text-gray-600'}`}>{label}</span>
      <Box big={total} />
    </div>
  )
}

/** The team names, large, over their score columns. */
function TeamHeader({ homeTeamName, awayTeamName, homeHint, awayHint, homeColor, awayColor, homeLogoUrl, awayLogoUrl }: { homeTeamName: string | null; awayTeamName: string | null; homeHint?: string | null; awayHint?: string | null; homeColor?: string | null; awayColor?: string | null; homeLogoUrl?: string | null; awayLogoUrl?: string | null }) {
  // Not seeded yet: a line to write the team in, with a faint reminder of
  // which slot it is under it — never a bold "TBD" where the name goes.
  const name = (n: string | null, hint?: string | null, color?: string | null, logoUrl?: string | null) => (
    isUnknown(n)
      ? (
        <span className="block">
          <span className="block mx-2 h-10 border-b-2 border-black" aria-label="Write the team name here" />
          <span className="block mt-1 text-[11px] text-gray-400 leading-tight">{hint || 'Team name'}</span>
        </span>
      )
      : <span className="block"><span className="block text-[26px] font-extrabold leading-tight break-words">{n}</span><TeamMark color={color} logoUrl={logoUrl} /></span>
  )
  return (
    <div className={`${COLS} items-stretch pb-2 mb-1 border-b-2 border-black`}>
      <div className="text-center min-w-0 flex flex-col justify-start">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Home</p>
        {name(homeTeamName, homeHint, homeColor, homeLogoUrl)}
      </div>
      <span className="self-start mt-7 text-center text-lg font-bold text-gray-400">vs</span>
      <div className="text-center min-w-0 flex flex-col justify-start">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Away</p>
        {name(awayTeamName, awayHint, awayColor, awayLogoUrl)}
      </div>
    </div>
  )
}

function InningsGrid({ count, homeTeamName, awayTeamName }: { count: number; homeTeamName: string | null; awayTeamName: string | null }) {
  const innings = Array.from({ length: count }, (_, i) => i + 1)
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="border border-black px-2 py-1 text-left w-40">Team</th>
            {innings.map(n => (
              <th key={n} className="border border-black px-2 py-1 text-center w-8">{n}</th>
            ))}
            <th className="border border-black px-2 py-1 text-center w-8">R</th>
            <th className="border border-black px-2 py-1 text-center w-8">H</th>
            <th className="border border-black px-2 py-1 text-center w-8">E</th>
          </tr>
        </thead>
        <tbody>
          {[homeTeamName, awayTeamName].map((team, i) => (
            <tr key={i}>
              <td className="border border-black px-2 py-2 font-bold text-base leading-tight">{isUnknown(team) ? <span className="text-[10px] font-normal text-gray-400">{i === 0 ? 'Home' : 'Away'}</span> : team}</td>
              {innings.map(n => (
                <td key={n} className="border border-black px-1 py-1.5" />
              ))}
              <td className="border border-black px-1 py-1.5" />
              <td className="border border-black px-1 py-1.5" />
              <td className="border border-black px-1 py-1.5" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One signatory row — print name + signature only (no date). */
function SignaturePerson({ label }: { label: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold mb-1 truncate">{label}</p>
      <div className="space-y-1">
        <div>
          <p className="text-[9px] text-gray-400 mb-0.5">Print name</p>
          <div className="border-b border-black h-5" />
        </div>
        <div>
          <p className="text-[9px] text-gray-400 mb-0.5">Signature</p>
          <div className="border-b border-black h-6" />
        </div>
      </div>
    </div>
  )
}

function SignatureBlock({ homeTeamName, awayTeamName }: { homeTeamName: string | null; awayTeamName: string | null }) {
  return (
    <div className="mt-4 pt-3 border-t-2 border-black">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Signatures</p>
      {/* Refs + scorekeeper in one 3-column row */}
      <div className="grid grid-cols-3 gap-x-5 mb-4">
        <SignaturePerson label="Referee 1" />
        <SignaturePerson label="Referee 2" />
        <SignaturePerson label="Scorekeeper" />
      </div>
      {/* Captains in one 2-column row */}
      <div className="grid grid-cols-2 gap-x-5">
        <SignaturePerson label={isUnknown(homeTeamName) ? 'Home Captain' : `Home Captain — ${homeTeamName}`} />
        <SignaturePerson label={isUnknown(awayTeamName) ? 'Away Captain' : `Away Captain — ${awayTeamName}`} />
      </div>
    </div>
  )
}

export function GameScoreSheet({ game, scoreStructure, leagueName, orgName, timezone, scanUrl, matchBanner }: Props) {
  const when = game.scheduledAt ? formatGameTime(game.scheduledAt, timezone) : null

  return (
    <div className="font-sans text-black text-sm">
      {matchBanner
        ? <Banner b={matchBanner} />
        : <GameBanner court={game.court?.trim().replace(/^court\s*/i, '') || null} date={when?.date ?? null} time={when?.time ?? null} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-lg font-bold leading-tight">{leagueName}</h1>
          {!matchBanner ? (
            // Court, date and time are in the banner above.
            (!!game.weekNumber || !!game.isExhibition) && (
              <p className="mt-1 text-sm text-gray-700">
                {[game.weekNumber ? `Week ${game.weekNumber}` : null, game.isExhibition ? 'Exhibition' : null].filter(Boolean).join(' · ')}
              </p>
            )
          ) : when ? (
            <p className="mt-1 text-sm">
              <span className="font-semibold">{when.date}</span>
              <span className="text-gray-700">
                {' · '}{when.time}
                {game.court ? ` · Court ${game.court}` : ''}
                {game.weekNumber ? ` · Week ${game.weekNumber}` : ''}
                {game.isExhibition ? ' · Exhibition' : ''}
              </span>
            </p>
          ) : (
            // Not scheduled yet: lines to fill in.
            <div className="mt-2 flex items-end gap-3 text-[11px] text-gray-500">
              {[['Date', 'w-24'], ['Time', 'w-16'], ['Court', 'w-12']].map(([label, w]) => (
                <span key={label} className="inline-flex items-end gap-1">
                  {label}<span className={`inline-block ${w} border-b border-black`} />
                </span>
              ))}
            </div>
          )}
        </div>
        {scanUrl && (
          <div className="shrink-0 flex flex-col items-center">
            <QRCode value={scanUrl} size={80} level="M" />
            <p className="mt-1 text-[9px] font-semibold text-gray-600 text-center leading-tight">Scan to enter<br />the score</p>
          </div>
        )}
      </div>

      <hr className="border-black mb-3" />

      {scoreStructure.type !== 'innings' && (
        <TeamHeader homeTeamName={game.homeTeamName} awayTeamName={game.awayTeamName} homeHint={game.homeHint} awayHint={game.awayHint} homeColor={safeColor(game.homeColor)} awayColor={safeColor(game.awayColor)} homeLogoUrl={safeLogo(game.homeLogoUrl)} awayLogoUrl={safeLogo(game.awayLogoUrl)} />
      )}

      {/* Score section */}
      <div className="mb-4">
        {scoreStructure.type === 'sets' && (
          <>
            {Array.from({ length: scoreStructure.count }, (_, i) => (
              <ScoreRow key={i} label={`Set ${i + 1}`} />
            ))}
            <ScoreRow label="Sets won" total />
          </>
        )}

        {(scoreStructure.type === 'periods' || scoreStructure.type === 'halves') && (
          <>
            {scoreStructure.labels.map((label) => (
              <ScoreRow key={label} label={label} />
            ))}
            <ScoreRow label="TOTAL" total />
          </>
        )}

        {scoreStructure.type === 'innings' && (
          <InningsGrid
            count={scoreStructure.count}
            homeTeamName={game.homeTeamName}
            awayTeamName={game.awayTeamName}
          />
        )}

        {scoreStructure.type === 'final' && (
          <div className="pt-2"><ScoreRow label="Final" total /></div>
        )}
      </div>

      {/* Notes */}
      <div className="mb-3">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Notes / Incidents</p>
        <div className="border border-gray-300 rounded h-10 w-full" />
      </div>

      <SignatureBlock homeTeamName={game.homeTeamName} awayTeamName={game.awayTeamName} />

      <p className="text-[9px] text-gray-400 text-center mt-3">
        {orgName} · {leagueName} · Generated by Fieldday
      </p>
    </div>
  )
}
