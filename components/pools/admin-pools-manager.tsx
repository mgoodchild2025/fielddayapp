'use client'

import { useState, useTransition, useMemo } from 'react'
import { createPool, deletePool, setTeamPool, generatePoolSchedule, seedPoolsFromStandings } from '@/actions/pools'

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

interface StandingTeam {
  id: string
  name: string
  wins: number
  losses: number
  ties: number
}

interface Props {
  leagueId: string
  initialPools: Pool[]
  initialTeams: Team[]
  standingsOrder?: StandingTeam[]
}

function PoolScheduleForm({ pool, leagueId, teamCount }: { pool: Pool; leagueId: string; teamCount: number }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; count?: number } | null>(null)
  const [startDate, setStartDate] = useState('')
  const [gameTime, setGameTime] = useState('10:00')
  const [daysBetween, setDaysBetween] = useState('0')
  const [courts, setCourts] = useState('1')
  const [gameDuration, setGameDuration] = useState('60')
  const [maxRounds, setMaxRounds] = useState('')
  const [courtNamesRaw, setCourtNamesRaw] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const parsedCourts = parseInt(courts) || 1
      const courtNames = courtNamesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, parsedCourts)
      const res = await generatePoolSchedule({
        poolId: pool.id,
        leagueId,
        startDate,
        gameTime,
        daysBetweenRounds: parseInt(daysBetween),
        courts: parsedCourts,
        gameDurationMinutes: parseInt(gameDuration),
        maxRounds: maxRounds ? parseInt(maxRounds) : undefined,
        courtNames: courtNames.length > 0 ? courtNames : undefined,
      })
      setResult(res)
      if (!res.error) setOpen(false)
    })
  }

  if (teamCount < 2) {
    return <p className="text-xs text-gray-400 px-5 pb-3">Add at least 2 teams to generate a schedule.</p>
  }

  const rounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount
  const gamesPerRound = Math.min(Math.floor(teamCount / 2), parseInt(courts) || 1)
  const effectiveRounds = maxRounds ? Math.min(parseInt(maxRounds) || rounds, rounds) : rounds
  const totalGames = effectiveRounds * gamesPerRound

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
            {teamCount} teams · {effectiveRounds}/{rounds} rounds · {gamesPerRound} game{gamesPerRound !== 1 ? 's' : ''}/round · {totalGames} total games
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
                type="number" min={0} max={30} value={daysBetween}
                onChange={(e) => setDaysBetween(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">0 = same day</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Courts</label>
              <input
                type="number" min={1} max={20} value={courts}
                onChange={(e) => setCourts(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">games running simultaneously</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Game Duration (min)</label>
              <input
                type="number" min={10} max={240} step={5} value={gameDuration}
                onChange={(e) => setGameDuration(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">
                Court Names <span className="text-gray-400 font-normal">(optional — comma-separated, e.g. "Court A, Court B")</span>
              </label>
              <input
                type="text" value={courtNamesRaw}
                placeholder={`Court 1, Court 2${parseInt(courts) > 2 ? ', …' : ''}`}
                onChange={(e) => setCourtNamesRaw(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">
                Max Rounds <span className="text-gray-400 font-normal">(optional — leave blank for full round-robin)</span>
              </label>
              <input
                type="number" min={1} max={rounds} value={maxRounds}
                placeholder={`1–${rounds}`}
                onChange={(e) => setMaxRounds(e.target.value)}
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

function SeedFromStandings({
  leagueId,
  standings,
  onSeeded,
}: {
  leagueId: string
  standings: StandingTeam[]
  onSeeded: (pools: { name: string; poolId: string }[], teams: Team[]) => void
}) {
  const [poolCount, setPoolCount] = useState(2)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => {
    const result: { name: string; teams: StandingTeam[] }[] = []
    const perPool = Math.ceil(standings.length / poolCount)
    const letters = 'ABCDEFGHIJ'
    for (let i = 0; i < poolCount; i++) {
      result.push({
        name: `Pool ${letters[i] ?? i + 1}`,
        teams: standings.slice(i * perPool, (i + 1) * perPool),
      })
    }
    return result.filter((p) => p.teams.length > 0)
  }, [standings, poolCount])

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const r = await seedPoolsFromStandings(
        leagueId,
        preview.map((p) => ({ name: p.name, teamIds: p.teams.map((t) => t.id) }))
      )
      if (r.error) { setError(r.error); return }
      // Signal parent to refresh — router.refresh() would lose optimistic state,
      // so we reload the page instead.
      window.location.reload()
    })
  }

  if (standings.length === 0) return null

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold">Seed pools from standings</p>
          <p className="text-xs text-gray-400 mt-0.5">Auto-assign teams based on current regular-season record</p>
        </div>
        <span className="text-gray-400 text-lg leading-none">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t px-5 pb-5 pt-4 space-y-4">
          {/* Pool count picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Number of pools</label>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPoolCount(n)}
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    poolCount === n
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg border divide-y text-sm">
            {preview.map((pool, pi) => (
              <div key={pi} className="px-4 py-3">
                <p className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-1">{pool.name}</p>
                <div className="space-y-0.5">
                  {pool.teams.map((t, ti) => (
                    <p key={t.id} className="text-sm text-gray-700">
                      <span className="text-gray-400 text-xs w-5 inline-block">{pi * Math.ceil(standings.length / poolCount) + ti + 1}.</span>
                      {t.name}
                      <span className="text-xs text-gray-400 ml-2">{t.wins}W–{t.losses}L{t.ties > 0 ? `–${t.ties}T` : ''}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Saving…' : 'Confirm & assign pools'}
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminPoolsManager({ leagueId, initialPools, initialTeams, standingsOrder }: Props) {
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
      {/* Seed from standings (shown when teams exist and no pools are assigned yet, or always) */}
      {standingsOrder && standingsOrder.length >= 2 && (
        <SeedFromStandings
          leagueId={leagueId}
          standings={standingsOrder}
          onSeeded={() => {}}
        />
      )}

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
                  <select
                    value={pool.id}
                    disabled={isPending}
                    onChange={(e) => handleAssign(t.id, e.target.value === '' ? null : e.target.value)}
                    className="border rounded-md px-2 py-1 text-xs focus:outline-none disabled:opacity-40"
                  >
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="">Unassign</option>
                  </select>
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
