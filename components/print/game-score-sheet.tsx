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
    <div className="flex items-center gap-3 py-2 border-b border-gray-200 last:border-0">
      <span className="w-24 text-sm font-medium text-gray-600 text-right">{label}</span>
      <div className="flex items-center gap-3">
        <span className="inline-block w-14 h-9 border-2 border-black rounded" />
        <span className="font-bold text-lg">—</span>
        <span className="inline-block w-14 h-9 border-2 border-black rounded" />
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
              <td className="border border-black px-2 py-2 font-medium text-xs truncate max-w-[6rem]">{team}</td>
              {innings.map(n => (
                <td key={n} className="border border-black px-1 py-2" />
              ))}
              <td className="border border-black px-1 py-2" />
              <td className="border border-black px-1 py-2" />
              <td className="border border-black px-1 py-2" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SignatureBlock({ homeTeamName, awayTeamName }: { homeTeamName: string; awayTeamName: string }) {
  const lines = [
    'Referee 1',
    'Referee 2',
    `Home Captain (${homeTeamName})`,
    `Away Captain (${awayTeamName})`,
  ]
  return (
    <div className="mt-8 pt-4 border-t-2 border-black space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Signatures</p>
      {lines.map((label) => (
        <div key={label} className="flex items-end gap-6">
          <span className="text-sm font-medium w-52 shrink-0">{label}</span>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 mb-0.5">Print name</p>
            <div className="border-b border-black h-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 mb-0.5">Signature</p>
            <div className="border-b border-black h-5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function GameScoreSheet({ game, scoreStructure, leagueName, orgName, timezone }: Props) {
  const { date, time } = formatGameTime(game.scheduledAt, timezone)

  return (
    <div className="font-sans text-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-xl font-bold leading-tight">{leagueName}</h1>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{date}</p>
          <p className="text-gray-600">{time}{game.court ? ` · Court ${game.court}` : ''}{game.weekNumber ? ` · Week ${game.weekNumber}` : ''}</p>
        </div>
      </div>

      <hr className="border-black mb-4" />

      {/* Teams */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-center flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Home</p>
          <p className="text-2xl font-bold">{game.homeTeamName}</p>
        </div>
        <div className="text-3xl font-bold text-gray-300 px-6">vs</div>
        <div className="text-center flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Away</p>
          <p className="text-2xl font-bold">{game.awayTeamName}</p>
        </div>
      </div>

      <hr className="border-gray-300 mb-4" />

      {/* Score section */}
      <div className="mb-6">
        {scoreStructure.type === 'sets' && (
          <div className="max-w-sm mx-auto">
            {Array.from({ length: scoreStructure.count }, (_, i) => (
              <ScoreBox key={i} label={`Set ${i + 1}`} />
            ))}
            <div className="flex items-center gap-3 pt-3 mt-2 border-t-2 border-black">
              <span className="w-24 text-sm font-bold text-right">TOTAL</span>
              <div className="flex items-center gap-3">
                <span className="inline-block w-14 h-9 border-2 border-black rounded bg-gray-50" />
                <span className="font-bold text-lg">—</span>
                <span className="inline-block w-14 h-9 border-2 border-black rounded bg-gray-50" />
              </div>
            </div>
          </div>
        )}

        {(scoreStructure.type === 'periods' || scoreStructure.type === 'halves') && (
          <div className="max-w-sm mx-auto">
            {scoreStructure.labels.map((label) => (
              <ScoreBox key={label} label={label} />
            ))}
            <div className="flex items-center gap-3 pt-3 mt-2 border-t-2 border-black">
              <span className="w-24 text-sm font-bold text-right">TOTAL</span>
              <div className="flex items-center gap-3">
                <span className="inline-block w-14 h-9 border-2 border-black rounded bg-gray-50" />
                <span className="font-bold text-lg">—</span>
                <span className="inline-block w-14 h-9 border-2 border-black rounded bg-gray-50" />
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
          <div className="flex justify-center items-center gap-6 py-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">{game.homeTeamName}</p>
              <span className="inline-block w-20 h-14 border-2 border-black rounded" />
            </div>
            <span className="text-4xl font-bold text-gray-300">—</span>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">{game.awayTeamName}</p>
              <span className="inline-block w-20 h-14 border-2 border-black rounded" />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes / Incidents</p>
        <div className="border border-gray-300 rounded h-16 w-full" />
      </div>

      <SignatureBlock homeTeamName={game.homeTeamName} awayTeamName={game.awayTeamName} />

      <p className="text-[10px] text-gray-400 text-center mt-6">
        {orgName} · {leagueName} · Generated by Fieldday
      </p>
    </div>
  )
}
