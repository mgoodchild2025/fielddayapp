import QRCode from 'react-qr-code'
import { type ScoreStructure } from '@/lib/print-config'
import { formatGameTime } from '@/lib/format-time'

interface Game {
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  homeTeamName: string
  awayTeamName: string
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
}

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
function TeamHeader({ homeTeamName, awayTeamName }: { homeTeamName: string; awayTeamName: string }) {
  const name = (n: string) => (
    n === 'TBD'
      ? <span className="block mx-6 mt-6 border-b-2 border-black" aria-label="Team to be filled in" />
      : <span className="block text-[26px] font-extrabold leading-tight break-words">{n}</span>
  )
  return (
    <div className={`${COLS} items-stretch pb-2 mb-1 border-b-2 border-black`}>
      <div className="text-center min-w-0 flex flex-col justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Home</p>
        {name(homeTeamName)}
      </div>
      <span className="self-end text-center text-lg font-bold text-gray-400 pb-1">vs</span>
      <div className="text-center min-w-0 flex flex-col justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Away</p>
        {name(awayTeamName)}
      </div>
    </div>
  )
}

function InningsGrid({ count, homeTeamName, awayTeamName }: { count: number; homeTeamName: string; awayTeamName: string }) {
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
          {[homeTeamName, awayTeamName].map(team => (
            <tr key={team}>
              <td className="border border-black px-2 py-2 font-bold text-base leading-tight">{team}</td>
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

function SignatureBlock({ homeTeamName, awayTeamName }: { homeTeamName: string; awayTeamName: string }) {
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
        <SignaturePerson label={`Home Captain — ${homeTeamName}`} />
        <SignaturePerson label={`Away Captain — ${awayTeamName}`} />
      </div>
    </div>
  )
}

export function GameScoreSheet({ game, scoreStructure, leagueName, orgName, timezone, scanUrl }: Props) {
  const { date, time } = formatGameTime(game.scheduledAt, timezone)

  return (
    <div className="font-sans text-black text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-lg font-bold leading-tight">{leagueName}</h1>
          <p className="mt-1 text-sm">
            <span className="font-semibold">{date}</span>
            <span className="text-gray-700">
              {' · '}{time}
              {game.court ? ` · Court ${game.court}` : ''}
              {game.weekNumber ? ` · Week ${game.weekNumber}` : ''}
              {game.isExhibition ? ' · Exhibition' : ''}
            </span>
          </p>
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
        <TeamHeader homeTeamName={game.homeTeamName} awayTeamName={game.awayTeamName} />
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
