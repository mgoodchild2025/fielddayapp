import { formatGameTime } from '@/lib/format-time'

interface Player {
  name: string
  position: string | null
}

interface StatDef {
  key: string
  label: string
}

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
  homeRoster: Player[]
  awayRoster: Player[]
  statDefs: StatDef[]
  leagueName: string
  orgName: string
  timezone: string
}

const WALK_IN_ROWS = 3
const FALLBACK_STATS: StatDef[] = [
  { key: 'stat1', label: 'Stat 1' },
  { key: 'stat2', label: 'Stat 2' },
  { key: 'stat3', label: 'Stat 3' },
  { key: 'stat4', label: 'Stat 4' },
  { key: 'stat5', label: 'Stat 5' },
  { key: 'stat6', label: 'Stat 6' },
]

function RosterTable({
  teamName,
  players,
  statDefs,
}: {
  teamName: string
  players: Player[]
  statDefs: StatDef[]
}) {
  const blankRows = Array.from({ length: WALK_IN_ROWS })
  // Limit stat columns to keep the table printable — max 8 stat cols
  const cols = statDefs.slice(0, 8)
  // Col widths: # (small), Name (flex), Pos (small), stats (equal), Notes (medium)
  const statColClass = 'text-center px-1 py-1.5 border-b border-gray-200 text-[11px]'
  const statHeaderClass = 'text-center px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border-b border-black'

  return (
    <div className="mb-6">
      <h2 className="text-base font-bold mb-2 pb-1 border-b border-black">
        {teamName}
      </h2>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className={`${statHeaderClass} text-left w-6`}>#</th>
            <th className={`${statHeaderClass} text-left`}>Player Name</th>
            <th className={`${statHeaderClass} text-left w-16`}>Pos</th>
            {cols.map((s) => (
              <th key={s.key} className={`${statHeaderClass} w-10`}>{s.label}</th>
            ))}
            <th className={`${statHeaderClass} text-left`}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
              <td className="border-b border-gray-200 px-1 py-1.5">
                <span className="inline-block w-5 h-5 border border-gray-400 rounded-sm" />
              </td>
              <td className="border-b border-gray-200 px-1 py-1.5 font-medium">{p.name}</td>
              <td className="border-b border-gray-200 px-1 py-1.5 text-gray-600 text-[11px]">{p.position ?? ''}</td>
              {cols.map((s) => (
                <td key={s.key} className={statColClass} />
              ))}
              <td className="border-b border-gray-200 px-1 py-1.5" />
            </tr>
          ))}
          {/* Walk-in blank rows */}
          {blankRows.map((_, i) => (
            <tr key={`blank-${i}`} className="opacity-60">
              <td className="border-b border-dashed border-gray-300 px-1 py-1.5">
                <span className="inline-block w-5 h-5 border border-dashed border-gray-400 rounded-sm" />
              </td>
              <td className="border-b border-dashed border-gray-300 px-1 py-2" />
              <td className="border-b border-dashed border-gray-300 px-1 py-2" />
              {cols.map((s) => (
                <td key={s.key} className="border-b border-dashed border-gray-300 px-1 py-2 text-center" />
              ))}
              <td className="border-b border-dashed border-gray-300 px-1 py-2" />
            </tr>
          ))}
          {/* Totals row */}
          <tr className="border-t-2 border-black font-bold">
            <td className="px-1 py-1.5" />
            <td className="px-1 py-1.5 text-xs">TOTALS</td>
            <td className="px-1 py-1.5" />
            {cols.map((s) => (
              <td key={s.key} className="px-1 py-1.5 text-center border-b border-black" />
            ))}
            <td className="px-1 py-1.5" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SignaturePerson({ label }: { label: string }) {
  return (
    <div>
      <p className="text-sm font-semibold mb-1">{label}</p>
      <div className="pl-2 space-y-2">
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Print name</p>
          <div className="border-b border-black h-6" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Signature</p>
          <div className="border-b border-black h-7" />
        </div>
        <div className="w-48">
          <p className="text-[10px] text-gray-400 mb-0.5">Date</p>
          <div className="border-b border-black h-6" />
        </div>
      </div>
    </div>
  )
}

function SignatureBlock({ homeTeamName, awayTeamName }: { homeTeamName: string; awayTeamName: string }) {
  return (
    <div className="mt-6 pt-4 border-t-2 border-black">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Signatures</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
        <SignaturePerson label="Referee 1" />
        <SignaturePerson label="Referee 2" />
        <SignaturePerson label="Scorekeeper" />
        <SignaturePerson label={`Home Captain / Coach (${homeTeamName})`} />
        <SignaturePerson label={`Away Captain / Coach (${awayTeamName})`} />
      </div>
    </div>
  )
}

export function GameStatSheet({ game, homeRoster, awayRoster, statDefs, leagueName, orgName, timezone }: Props) {
  const { date, time } = formatGameTime(game.scheduledAt, timezone)
  const cols = statDefs.length > 0 ? statDefs : FALLBACK_STATS

  return (
    <div className="font-sans text-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{orgName}</p>
          <h1 className="text-xl font-bold leading-tight">{leagueName} — Stat Sheet</h1>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{date}</p>
          <p className="text-gray-600">{time}{game.court ? ` · Court ${game.court}` : ''}{game.weekNumber ? ` · Week ${game.weekNumber}` : ''}</p>
        </div>
      </div>

      <hr className="border-black mb-4" />

      {/* Roster + stat tables */}
      <RosterTable teamName={game.homeTeamName} players={homeRoster} statDefs={cols} />
      <RosterTable teamName={game.awayTeamName} players={awayRoster} statDefs={cols} />

      {/* Final score */}
      <div className="flex items-center gap-4 mt-4 mb-2">
        <p className="text-sm font-semibold">Final Score:</p>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[10px] text-gray-500">{game.homeTeamName}</p>
            <span className="inline-block w-12 h-8 border-2 border-black rounded" />
          </div>
          <span className="font-bold text-lg">—</span>
          <div className="text-center">
            <p className="text-[10px] text-gray-500">{game.awayTeamName}</p>
            <span className="inline-block w-12 h-8 border-2 border-black rounded" />
          </div>
        </div>
      </div>

      <SignatureBlock homeTeamName={game.homeTeamName} awayTeamName={game.awayTeamName} />

      <p className="text-[10px] text-gray-400 text-center mt-4">
        {orgName} · {leagueName} · Generated by Fieldday · # column = jersey number (fill in manually)
      </p>
    </div>
  )
}
