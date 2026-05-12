import { type ScoreStructure } from '@/lib/print-config'
import { formatGameTime } from '@/lib/format-time'

interface Game {
  id: string
  scheduledAt: string
  court: string | null
  weekNumber: number | null
  homeTeamName: string
  awayTeamName: string
}

interface Props {
  game: Game
  scoreStructure: ScoreStructure
  leagueName: string
  orgName: string
  timezone: string
}

function ScoreBox({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-gray-200 last:border-0">
      <span className="w-20 text-xs font-medium text-gray-600 text-right shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <span className="inline-block w-12 h-7 border-2 border-black rounded" />
        <span className="font-bold text-sm">—</span>
        <span className="inline-block w-12 h-7 border-2 border-black rounded" />
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
            <th className="border border-black px-2 py-1 text-left w-24">Team</th>
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
              <td className="border border-black px-2 py-1.5 font-medium text-xs truncate max-w-[6rem]">{team}</td>
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

export function GameScoreSheet({ game, scoreStructure, leagueName, orgName, timezone }: Props) {
  const { date, time } = formatGameTime(game.scheduledAt, timezone)

  return (
    <div className="font-sans text-black text-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-lg font-bold leading-tight">{leagueName}</h1>
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold">{date}</p>
          <p className="text-gray-600">
            {time}
            {game.court ? ` · Court ${game.court}` : ''}
            {game.weekNumber ? ` · Week ${game.weekNumber}` : ''}
          </p>
        </div>
      </div>

      <hr className="border-black mb-3" />

      {/* Teams */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-center flex-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Home</p>
          <p className="text-xl font-bold leading-tight">{game.homeTeamName}</p>
        </div>
        <div className="text-2xl font-bold text-gray-300 px-4">vs</div>
        <div className="text-center flex-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Away</p>
          <p className="text-xl font-bold leading-tight">{game.awayTeamName}</p>
        </div>
      </div>

      <hr className="border-gray-300 mb-3" />

      {/* Score section */}
      <div className="mb-3">
        {scoreStructure.type === 'sets' && (
          <div className="w-fit mx-auto">
            <div className="flex items-center gap-2 pb-1 mb-1 border-b border-gray-400">
              <span className="w-20 text-[10px] font-semibold text-gray-400 uppercase text-right shrink-0">Period</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase">Home — Away</span>
            </div>
            {Array.from({ length: scoreStructure.count }, (_, i) => (
              <ScoreBox key={i} label={`Set ${i + 1}`} />
            ))}
            <div className="flex items-center gap-2 pt-2 mt-1 border-t-2 border-black">
              <span className="w-20 text-xs font-bold text-right shrink-0">TOTAL</span>
              <div className="flex items-center gap-2">
                <span className="inline-block w-12 h-7 border-2 border-black rounded bg-gray-50" />
                <span className="font-bold text-sm">—</span>
                <span className="inline-block w-12 h-7 border-2 border-black rounded bg-gray-50" />
              </div>
            </div>
          </div>
        )}

        {(scoreStructure.type === 'periods' || scoreStructure.type === 'halves') && (
          <div className="w-fit mx-auto">
            <div className="flex items-center gap-2 pb-1 mb-1 border-b border-gray-400">
              <span className="w-20 text-[10px] font-semibold text-gray-400 uppercase text-right shrink-0">Period</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase">Home — Away</span>
            </div>
            {scoreStructure.labels.map((label) => (
              <ScoreBox key={label} label={label} />
            ))}
            <div className="flex items-center gap-2 pt-2 mt-1 border-t-2 border-black">
              <span className="w-20 text-xs font-bold text-right shrink-0">TOTAL</span>
              <div className="flex items-center gap-2">
                <span className="inline-block w-12 h-7 border-2 border-black rounded bg-gray-50" />
                <span className="font-bold text-sm">—</span>
                <span className="inline-block w-12 h-7 border-2 border-black rounded bg-gray-50" />
              </div>
            </div>
          </div>
        )}

        {scoreStructure.type === 'innings' && (
          <InningsGrid
            count={scoreStructure.count}
            homeTeamName={game.homeTeamName}
            awayTeamName={game.awayTeamName}
          />
        )}

        {scoreStructure.type === 'final' && (
          <div className="flex justify-center items-center gap-6 py-3">
            <div className="text-center">
              <p className="text-[10px] text-gray-500 mb-1">{game.homeTeamName}</p>
              <span className="inline-block w-16 h-12 border-2 border-black rounded" />
            </div>
            <span className="text-3xl font-bold text-gray-300">—</span>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 mb-1">{game.awayTeamName}</p>
              <span className="inline-block w-16 h-12 border-2 border-black rounded" />
            </div>
          </div>
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
