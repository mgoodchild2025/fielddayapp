'use client'

import { useState, useTransition } from 'react'
import { createPool, deletePool, setTeamPool, generatePoolSchedule } from '@/actions/pools'

interface Pool {
  id: string
  name: string
  sort_order: number
}

interface Team {
  id: string
  name: string
  pool_id: string | null
}

interface Props {
  leagueId: string
  initialPools: Pool[]
  initialTeams: Team[]
}

function PoolScheduleForm({ pool, leagueId, teamCount }: { pool: Pool; leagueId: string; teamCount: number }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; count?: number } | null>(null)
  const [startDate, setStartDate] = useState('')
  const [gameTime, setGameTime] = useState('10:00')
  const [daysBetween, setDaysBetween] = useState('1')
  const [courts, setCourts] = useState('1')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await generatePoolSchedule({
        poolId: pool.id,
        leagueId,
        startDate,
        gameTime,
        daysBetweenRounds: parseInt(daysBetween),
        courts: parseInt(courts),
      })
      setResult(res)
      if (!res.error) setOpen(false)
    })
  }

  if (teamCount < 2) {
    return <p className="text-xs text-gray-400 px-5 pb-3">Add at least 2 teams to generate a schedule.</p>
  }

  const rounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount
  const gamesPerRound = Math.floor(teamCount / 2)

  return (
    <div className="px-5 pb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold"
        style={{ color: 'var(--brand-primary)' }}
      >
        {open ? '▲ Hide schedule generator' : '⚡ Generate pool schedule'}
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2 bg-gray-50 rounded-lg p-4 border">
          <p className="text-xs text-gray-500">
            {teamCount} teams → {rounds} rounds, {gamesPerRound} game{gamesPerRound !== 1 ? 's' : ''}/round
          </p>
          {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
          {result?.count != null && !result.error && (
            <p className="text-xs text-green-600">Generated {result.count} games!</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Start Date *</label>
              <input
                type="date" required value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Game Time</label>
              <input
                type="time" value={gameTime}
                onChange={(e) => setGameTime(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Days Between Rounds</label>
              <input
                type="number" min={1} max={30} value={daysBetween}
                onChange={(e) => setDaysBetween(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Courts</label>
              <input
                type="number" min={1} max={20} value={courts}
                onChange={(e) => setCourts(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit" disabled={isPending}
            className="w-full py-1.5 rounded-md text-white text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Generating…' : 'Generate Schedule'}
          </button>
        </form>
      )}
    </div>
  )
}

export function AdminPoolsManager({ leagueId, initialPools, initialTeams }: Props) {
  const [pools, setPools] = useState(initialPools)
  const [teams, setTeams] = useState(initialTeams)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const result = await createPool(leagueId, newName)
    if (result.error) {
      setFormError(result.error)
    } else {
      setNewName('')
    }
  }

  function handleDelete(poolId: string) {
    startTransition(async () => {
      const result = await deletePool(poolId, leagueId)
      if (!result.error) {
        setPools((prev) => prev.filter((p) => p.id !== poolId))
        setTeams((prev) =>
          prev.map((t) => (t.pool_id === poolId ? { ...t, pool_id: null } : t))
        )
      }
    })
  }

  function handleAssign(teamId: string, poolId: string | null) {
    startTransition(async () => {
      const result = await setTeamPool(teamId, leagueId, poolId)
      if (!result.error) {
        setTeams((prev) =>
          prev.map((t) => (t.id === teamId ? { ...t, pool_id: poolId } : t))
        )
      }
    })
  }

  const unassigned = teams.filter((t) => !t.pool_id)

  return (
    <div className="space-y-6">
      {/* Create pool */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Pool name (e.g. Pool A, Pool B)"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <button
          type="submit"
          disabled={!newName.trim() || isPending}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Add Pool
        </button>
      </form>
      {formError && <p className="text-red-500 text-xs -mt-4">{formError}</p>}

      {pools.length === 0 && (
        <div className="bg-white border rounded-lg px-6 py-10 text-center text-gray-400 text-sm">
          No pools yet. Add one above to start seeding teams.
        </div>
      )}

      {pools.map((pool) => {
        const poolTeams = teams.filter((t) => t.pool_id === pool.id)
        return (
          <div key={pool.id} className="bg-white border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
              <p className="font-semibold text-sm">{pool.name}</p>
              <button
                onClick={() => handleDelete(pool.id)}
                disabled={isPending}
                className="text-xs text-red-500 hover:underline disabled:opacity-40"
              >
                Delete
              </button>
            </div>
            <ul className="divide-y">
              {poolTeams.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-400 w-4">{i + 1}</span>
                    <span className="text-sm font-medium">{t.name}</span>
                  </div>
                  <button
                    onClick={() => handleAssign(t.id, null)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {poolTeams.length === 0 && (
                <li className="px-5 py-4 text-xs text-gray-400">No teams assigned yet.</li>
              )}
            </ul>
            <PoolScheduleForm pool={pool} leagueId={leagueId} teamCount={poolTeams.length} />
          </div>
        )
      })}

      {/* Unassigned teams */}
      {unassigned.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b bg-amber-50">
            <p className="font-semibold text-sm text-amber-800">
              Unassigned Teams <span className="font-normal text-amber-600">({unassigned.length})</span>
            </p>
          </div>
          <ul className="divide-y">
            {unassigned.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm font-medium">{t.name}</span>
                <select
                  defaultValue=""
                  disabled={isPending || pools.length === 0}
                  onChange={(e) => {
                    if (e.target.value) handleAssign(t.id, e.target.value)
                  }}
                  className="border rounded-md px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="" disabled>Assign to…</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teams.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No teams in this event yet.
        </p>
      )}
    </div>
  )
}
