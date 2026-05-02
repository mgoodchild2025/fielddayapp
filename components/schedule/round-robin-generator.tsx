'use client'

import { useState, useTransition } from 'react'
import { generateRoundRobinSchedule } from '@/actions/schedule'
import { useRouter } from 'next/navigation'

export function RoundRobinGenerator({ leagueId, teamCount }: { leagueId: string; teamCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ error?: string | null; count?: number; isTemplate?: boolean } | null>(null)

  const [startDate, setStartDate] = useState('')
  const [gameTime, setGameTime] = useState('19:00')
  const [daysBetweenRounds, setDaysBetweenRounds] = useState('7')
  const [courts, setCourts] = useState('1')
  const [expectedTeamCount, setExpectedTeamCount] = useState('8')

  const noTeams = teamCount < 2
  const activeCount = noTeams ? parseInt(expectedTeamCount) || 8 : teamCount
  const expectedRounds = activeCount % 2 === 0 ? activeCount - 1 : activeCount
  const gamesPerRound = Math.floor(activeCount / 2)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    start(async () => {
      const res = await generateRoundRobinSchedule({
        leagueId,
        startDate,
        gameTime,
        daysBetweenRounds: parseInt(daysBetweenRounds),
        courts: parseInt(courts),
        ...(noTeams ? { expectedTeamCount: parseInt(expectedTeamCount) } : {}),
      })
      setResult(res)
      if (!res.error) { router.refresh(); setOpen(false) }
    })
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold"
      >
        <span>⚡ Round-robin Generator</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {noTeams && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
              <p className="font-medium mb-0.5">Template mode — no teams yet</p>
              <p>Games will use &ldquo;Team 1&rdquo;, &ldquo;Team 2&rdquo;, etc. as placeholders. Assign real teams later from the schedule.</p>
            </div>
          )}

          {noTeams && (
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Expected Team Count *</label>
              <input
                type="number"
                min={2}
                max={32}
                value={expectedTeamCount}
                onChange={e => setExpectedTeamCount(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
          )}

          <p className="text-xs text-gray-500">
            {activeCount} teams → {expectedRounds} rounds, {gamesPerRound} game{gamesPerRound !== 1 ? 's' : ''}/round
          </p>
          {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
          {result?.count && (
            <p className="text-xs text-green-600">
              {result.isTemplate
                ? `Generated ${result.count} template games — assign teams from the schedule table.`
                : `Generated ${result.count} games!`}
            </p>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Start Date *</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Game Time</label>
              <input type="time" value={gameTime} onChange={e => setGameTime(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Courts</label>
              <input type="number" min={1} max={10} value={courts} onChange={e => setCourts(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Days Between Rounds</label>
            <input type="number" min={1} max={30} value={daysBetweenRounds} onChange={e => setDaysBetweenRounds(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded-md text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {pending ? 'Generating…' : noTeams ? 'Generate Template Schedule' : 'Generate Schedule'}
          </button>
        </form>
      )}
    </div>
  )
}
