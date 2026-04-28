'use client'

import { useState, useTransition } from 'react'
import { generateRoundRobinSchedule } from '@/actions/schedule'
import { useRouter } from 'next/navigation'

export function RoundRobinGenerator({ leagueId, teamCount }: { leagueId: string; teamCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ error?: string; count?: number } | null>(null)

  const [startDate, setStartDate] = useState('')
  const [gameTime, setGameTime] = useState('19:00')
  const [daysBetweenRounds, setDaysBetweenRounds] = useState('7')
  const [courts, setCourts] = useState('1')

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
      })
      setResult(res)
      if (!res.error) { router.refresh(); setOpen(false) }
    })
  }

  if (teamCount < 2) {
    return (
      <div className="bg-white rounded-lg border p-4 text-sm text-gray-400">
        Add at least 2 active teams to generate a round-robin schedule.
      </div>
    )
  }

  const expectedRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount
  const gamesPerRound = Math.floor(teamCount / 2)

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
          <p className="text-xs text-gray-500">
            {teamCount} teams → {expectedRounds} rounds, {gamesPerRound} games/round
          </p>
          {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
          {result?.count && <p className="text-xs text-green-600">Generated {result.count} games!</p>}
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
            {pending ? 'Generating…' : 'Generate Schedule'}
          </button>
        </form>
      )}
    </div>
  )
}
