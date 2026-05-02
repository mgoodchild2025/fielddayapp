'use client'

import { useState, useTransition, useMemo } from 'react'
import { generateRoundRobinSchedule } from '@/actions/schedule'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'weekly' | 'day_schedule'

interface SpecialBreak {
  id: string       // local key only
  label: string
  startTime: string
  durationMinutes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Estimate end time for day-schedule mode. */
function estimateFinish(
  startDate: string,
  startTime: string,
  gameDuration: number,
  breakBetweenSlots: number,
  courtsAvailable: number,
  teamCount: number,
  specialBreaks: SpecialBreak[],
): { endTime: string; totalMinutes: number } | null {
  if (!startDate || !startTime || teamCount < 2 || courtsAvailable < 1) return null
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1  // round up to even for bye
  const rounds = n - 1
  const gamesPerRound = n / 2
  const slotsPerRound = Math.ceil(gamesPerRound / courtsAvailable)
  const totalSlots = rounds * slotsPerRound

  // Special break minutes that will actually be hit
  const breakMins = specialBreaks
    .filter(b => b.startTime && parseInt(b.durationMinutes) > 0)
    .reduce((sum, b) => sum + (parseInt(b.durationMinutes) || 0), 0)

  const totalMinutes =
    totalSlots * gameDuration +
    (totalSlots - 1) * breakBetweenSlots +
    breakMins

  try {
    const start = new Date(`${startDate}T${startTime}`)
    if (isNaN(start.getTime())) return null
    const end = new Date(start.getTime() + totalMinutes * 60_000)
    return { endTime: formatTime(end), totalMinutes }
  } catch {
    return null
  }
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

let breakCounter = 1

// ── Component ─────────────────────────────────────────────────────────────────

type TeamCountSource = 'existing' | 'custom'

export function RoundRobinGenerator({
  leagueId,
  teamCount,
  maxTeams = null,
}: {
  leagueId: string
  teamCount: number
  maxTeams?: number | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ error?: string | null; count?: number; isTemplate?: boolean } | null>(null)
  const [mode, setMode] = useState<Mode>('weekly')

  // ── Weekly fields ──────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('')
  const [gameTime, setGameTime] = useState('19:00')
  const [daysBetweenRounds, setDaysBetweenRounds] = useState('7')
  const [courts, setCourts] = useState('1')

  // ── Day-schedule fields ────────────────────────────────────────────────────
  const [dsDate, setDsDate] = useState('')
  const [dsTime, setDsTime] = useState('09:00')
  const [dsGameDuration, setDsGameDuration] = useState('45')
  const [dsBreak, setDsBreak] = useState('15')
  const [dsCourts, setDsCourts] = useState('2')
  const [specialBreaks, setSpecialBreaks] = useState<SpecialBreak[]>([])

  // ── Team count source ──────────────────────────────────────────────────────
  const hasExistingTeams = teamCount >= 2
  const [teamCountSource, setTeamCountSource] = useState<TeamCountSource>(
    hasExistingTeams ? 'existing' : 'custom'
  )
  // Pre-fill custom count with maxTeams if set, else existing count, else 8
  const [customCount, setCustomCount] = useState(
    String(maxTeams ?? (hasExistingTeams ? teamCount : 8))
  )

  const useCustomCount = teamCountSource === 'custom'
  const noTeams = !hasExistingTeams  // kept for template-mode notices
  const activeCount = useCustomCount ? (parseInt(customCount) || 8) : teamCount
  const useSlotMode = useCustomCount || noTeams
  const expectedRounds = activeCount % 2 === 0 ? activeCount - 1 : activeCount
  const gamesPerRound = Math.floor(activeCount / 2)

  // ── Estimated finish (day-schedule mode) ───────────────────────────────────
  const estimate = useMemo(() => {
    if (mode !== 'day_schedule') return null
    return estimateFinish(
      dsDate,
      dsTime,
      parseInt(dsGameDuration) || 45,
      parseInt(dsBreak) || 15,
      parseInt(dsCourts) || 2,
      activeCount,
      specialBreaks,
    )
  }, [mode, dsDate, dsTime, dsGameDuration, dsBreak, dsCourts, activeCount, specialBreaks])

  // ── Special break helpers ──────────────────────────────────────────────────
  function addBreak() {
    setSpecialBreaks(prev => [...prev, {
      id: String(breakCounter++),
      label: 'Lunch',
      startTime: '12:00',
      durationMinutes: '60',
    }])
  }

  function updateBreak(id: string, field: keyof Omit<SpecialBreak, 'id'>, value: string) {
    setSpecialBreaks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b))
  }

  function removeBreak(id: string) {
    setSpecialBreaks(prev => prev.filter(b => b.id !== id))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    start(async () => {
      const base = {
        leagueId,
        ...(useSlotMode ? { expectedTeamCount: activeCount } : {}),
      }

      let res
      if (mode === 'day_schedule') {
        res = await generateRoundRobinSchedule({
          ...base,
          daySchedule: {
            startDate: dsDate,
            startTime: dsTime,
            gameDurationMinutes: parseInt(dsGameDuration) || 45,
            breakBetweenSlotsMinutes: parseInt(dsBreak) || 15,
            courtsAvailable: parseInt(dsCourts) || 2,
            specialBreaks: specialBreaks
              .filter(b => b.startTime && parseInt(b.durationMinutes) > 0)
              .map(b => ({
                label: b.label,
                startTime: b.startTime,
                durationMinutes: parseInt(b.durationMinutes),
              })),
          },
        })
      } else {
        res = await generateRoundRobinSchedule({
          ...base,
          startDate,
          gameTime,
          daysBetweenRounds: parseInt(daysBetweenRounds),
          courts: parseInt(courts),
        })
      }

      setResult(res)
      if (!res.error) { router.refresh(); setOpen(false) }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputCls = 'w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400'

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

          {/* ── Team count source ── */}
          {hasExistingTeams ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Teams</label>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setTeamCountSource('existing')}
                  className={`flex-1 py-1.5 font-medium transition-colors ${
                    teamCountSource === 'existing'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Existing ({teamCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTeamCountSource('custom')}
                  className={`flex-1 py-1.5 font-medium transition-colors ${
                    teamCountSource === 'custom'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Custom{maxTeams ? ` (max ${maxTeams})` : ''}
                </button>
              </div>

              {teamCountSource === 'custom' && (
                <div className="mt-2 space-y-1.5">
                  <input
                    type="number" min={2} max={64}
                    value={customCount}
                    onChange={e => setCustomCount(e.target.value)}
                    required
                    placeholder="Number of teams"
                    className={inputCls}
                  />
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Placeholder labels (Team 1, Team 2…) will be used. Assign real teams from the schedule later.
                  </p>
                </div>
              )}
            </div>
          ) : (
            // No teams yet — always custom
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">
                Team count{maxTeams ? ` (max ${maxTeams})` : ''} *
              </label>
              <input
                type="number" min={2} max={64}
                value={customCount}
                onChange={e => setCustomCount(e.target.value)}
                required
                className={inputCls}
              />
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5">
                No teams registered yet. Games will use Team 1, Team 2… as placeholders.
              </p>
            </div>
          )}

          {/* ── Schedule mode toggle ── */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
            {(['weekly', 'day_schedule'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {m === 'weekly' ? 'Weekly' : 'Day schedule'}
              </button>
            ))}
          </div>

          {/* ── Stats line ── */}
          <p className="text-xs text-gray-500">
            {activeCount} teams → {expectedRounds} round{expectedRounds !== 1 ? 's' : ''}, {gamesPerRound} game{gamesPerRound !== 1 ? 's' : ''}/round
            {mode === 'day_schedule' && parseInt(dsCourts) > 0 && (
              <> · {Math.ceil(gamesPerRound / (parseInt(dsCourts) || 1))} slot{Math.ceil(gamesPerRound / (parseInt(dsCourts) || 1)) !== 1 ? 's' : ''}/round</>
            )}
          </p>

          {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
          {result?.count != null && !result.error && (
            <p className="text-xs text-green-600">
              {result.isTemplate
                ? `Generated ${result.count} template games — assign teams from the schedule table.`
                : `Generated ${result.count} games!`}
            </p>
          )}

          {/* ════════════════════════════════════════════════════════════════
              WEEKLY MODE FIELDS
          ════════════════════════════════════════════════════════════════ */}
          {mode === 'weekly' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Start Date *</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Game Time</label>
                  <input type="time" value={gameTime} onChange={e => setGameTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Courts</label>
                  <input type="number" min={1} max={10} value={courts} onChange={e => setCourts(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Days Between Rounds</label>
                <input type="number" min={1} max={30} value={daysBetweenRounds} onChange={e => setDaysBetweenRounds(e.target.value)} className={inputCls} />
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DAY-SCHEDULE MODE FIELDS
          ════════════════════════════════════════════════════════════════ */}
          {mode === 'day_schedule' && (
            <>
              {/* Date + time */}
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Date *</label>
                  <input type="date" value={dsDate} onChange={e => setDsDate(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">First game</label>
                  <input type="time" value={dsTime} onChange={e => setDsTime(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Duration + break */}
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Game duration (min)</label>
                  <input type="number" min={5} max={240} value={dsGameDuration} onChange={e => setDsGameDuration(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Break between games (min)</label>
                  <input type="number" min={0} max={120} value={dsBreak} onChange={e => setDsBreak(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Courts */}
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Simultaneous courts</label>
                <input type="number" min={1} max={10} value={dsCourts} onChange={e => setDsCourts(e.target.value)} className={inputCls} />
                <p className="text-xs text-gray-400 mt-0.5">
                  Games in a round fill all courts; overflow spills to the next time slot.
                </p>
              </div>

              {/* Special breaks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Special breaks</span>
                  <button
                    type="button"
                    onClick={addBreak}
                    className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-0.5 bg-white"
                  >
                    + Add break
                  </button>
                </div>

                {specialBreaks.length === 0 && (
                  <p className="text-xs text-gray-400">No breaks added. Use &ldquo;Add break&rdquo; for lunch, halftime, etc.</p>
                )}

                {specialBreaks.map(br => (
                  <div key={br.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center bg-gray-50 border border-gray-100 rounded-md p-2">
                    <input
                      type="text"
                      value={br.label}
                      onChange={e => updateBreak(br.id, 'label', e.target.value)}
                      placeholder="Label (e.g. Lunch)"
                      className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <div className="flex flex-col items-start">
                      <span className="text-[10px] text-gray-400 mb-0.5">Start</span>
                      <input
                        type="time"
                        value={br.startTime}
                        onChange={e => updateBreak(br.id, 'startTime', e.target.value)}
                        className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[10px] text-gray-400 mb-0.5">Min</span>
                      <input
                        type="number"
                        min={1}
                        max={480}
                        value={br.durationMinutes}
                        onChange={e => updateBreak(br.id, 'durationMinutes', e.target.value)}
                        className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBreak(br.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none pb-0.5"
                      title="Remove break"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Estimated finish */}
              {estimate && (
                <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-800">
                  Estimated finish: <span className="font-semibold">{estimate.endTime}</span>
                  <span className="text-blue-600 ml-1">({formatDuration(estimate.totalMinutes)} total)</span>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded-md text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {pending ? 'Generating…' : useSlotMode ? 'Generate Template Schedule' : 'Generate Schedule'}
          </button>
        </form>
      )}
    </div>
  )
}
