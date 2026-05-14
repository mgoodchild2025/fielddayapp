'use client'

import { useState, useTransition, useMemo } from 'react'
import { generateRoundRobinSchedule, generateWeeklyLeagueSchedule, generatePickupSchedule } from '@/actions/schedule'
import { useRouter } from 'next/navigation'
import { venueLabel } from '@/lib/venue-label'

// ── Types ─────────────────────────────────────────────────────────────────────

type TopMode = 'weekly_league' | 'pickup' | 'single_day'

interface SpecialBreak {
  id: string
  label: string
  startTime: string
  durationMinutes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_FULL   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Client-side duplicate of getGameDays for the preview counter. */
function countGameDays(startDate: string, endDate: string, daysOfWeek: number[]): number {
  if (!startDate || !endDate || !daysOfWeek.length) return 0
  const dowSet = new Set(daysOfWeek)
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd, 12, 0, 0)
  const end    = new Date(ey, em - 1, ed, 12, 0, 0)
  if (cursor > end) return 0
  let count = 0
  while (cursor <= end) {
    if (dowSet.has(cursor.getDay())) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

/** Round-robin fixture count for N teams. */
function fixtureCount(teamCount: number): number {
  if (teamCount < 2) return 0
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1
  return ((n - 1) * (n / 2))
}

function estimateDayScheduleFinish(
  startDate: string,
  startTime: string,
  gameDuration: number,
  breakBetweenSlots: number,
  courtsAvailable: number,
  teamCount: number,
  specialBreaks: SpecialBreak[],
): { endTime: string; totalMinutes: number } | null {
  if (!startDate || !startTime || teamCount < 2 || courtsAvailable < 1) return null
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1
  const rounds = n - 1
  const gamesPerRound = n / 2
  const slotsPerRound = Math.ceil(gamesPerRound / courtsAvailable)
  const totalSlots = rounds * slotsPerRound
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

let breakCounter = 1

// ── Sub-components ────────────────────────────────────────────────────────────

function DayOfWeekPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  function toggle(day: number) {
    onChange(
      selected.includes(day)
        ? selected.filter(d => d !== day)
        : [...selected, day].sort((a, b) => a - b)
    )
  }
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Day(s) of week *</label>
      <div className="flex gap-1">
        {DOW_LABELS.map((label, i) => (
          <button
            key={i}
            type="button"
            title={DOW_FULL[i]}
            onClick={() => toggle(i)}
            className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors ${
              selected.includes(i)
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TimeSlotList({
  slots,
  onChange,
  max = 8,
}: {
  slots: string[]
  onChange: (slots: string[]) => void
  max?: number
}) {
  function update(index: number, value: string) {
    const next = [...slots]
    next[index] = value
    onChange(next)
  }
  function remove(index: number) {
    onChange(slots.filter((_, i) => i !== index))
  }
  function add() {
    if (slots.length >= max) return
    // Default: 1 hour after the last slot, or 19:00
    let next = '19:00'
    if (slots.length > 0) {
      const last = slots[slots.length - 1]
      const [h, m] = last.split(':').map(Number)
      const totalMin = h * 60 + m + 60
      next = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
    }
    onChange([...slots, next])
  }

  const inputCls = 'border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400'

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Time slot(s) *</label>
      <div className="space-y-1.5">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              value={slot}
              onChange={e => update(i, e.target.value)}
              className={inputCls}
              required
            />
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                title="Remove slot"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {slots.length < max && (
        <button
          type="button"
          onClick={add}
          className="mt-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-0.5 bg-white"
        >
          + Add time
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type TeamCountSource = 'existing' | 'custom'

export function RoundRobinGenerator({
  leagueId,
  teamCount,
  maxTeams = null,
  sport,
}: {
  leagueId: string
  teamCount: number
  maxTeams?: number | null
  sport?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ error?: string | null; count?: number; isTemplate?: boolean } | null>(null)

  // ── Top-level mode ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TopMode>('weekly_league')

  // ── Team count source (used by weekly_league + single_day) ─────────────────
  const hasExistingTeams = teamCount >= 2
  const [teamCountSource, setTeamCountSource] = useState<TeamCountSource>(
    hasExistingTeams ? 'existing' : 'custom'
  )
  const [customCount, setCustomCount] = useState(
    String(maxTeams ?? (hasExistingTeams ? teamCount : 8))
  )
  const useCustomCount  = teamCountSource === 'custom'
  const activeCount     = useCustomCount ? (parseInt(customCount) || 8) : teamCount
  const useSlotMode     = useCustomCount || !hasExistingTeams

  // ── Weekly league state ─────────────────────────────────────────────────────
  const [wlDaysOfWeek,      setWlDaysOfWeek]      = useState<number[]>([])
  const [wlStartDate,       setWlStartDate]        = useState('')
  const [wlEndDate,         setWlEndDate]          = useState('')
  const [wlTimeSlots,       setWlTimeSlots]        = useState<string[]>(['19:00'])
  const [wlCourts,          setWlCourts]           = useState('1')
  const [wlGameDuration,    setWlGameDuration]     = useState('60')
  const [wlRepeatRotations, setWlRepeatRotations]  = useState(false)

  // ── Pickup state ────────────────────────────────────────────────────────────
  const [puDaysOfWeek,   setPuDaysOfWeek]   = useState<number[]>([])
  const [puStartDate,    setPuStartDate]    = useState('')
  const [puEndDate,      setPuEndDate]      = useState('')
  const [puTimeSlots,    setPuTimeSlots]    = useState<string[]>(['19:00'])
  const [puCourts,       setPuCourts]       = useState('1')
  const [puGameDuration, setPuGameDuration] = useState('60')

  // ── Single day state (unchanged from original) ─────────────────────────────
  const [dsDate,       setDsDate]       = useState('')
  const [dsTime,       setDsTime]       = useState('09:00')
  const [dsGameDuration, setDsGameDuration] = useState('45')
  const [dsBreak,      setDsBreak]      = useState('15')
  const [dsCourts,     setDsCourts]     = useState('2')
  const [specialBreaks, setSpecialBreaks] = useState<SpecialBreak[]>([])

  // ── Previews ────────────────────────────────────────────────────────────────
  const wlPreview = useMemo(() => {
    if (mode !== 'weekly_league') return null
    const days    = countGameDays(wlStartDate, wlEndDate, wlDaysOfWeek)
    const slots   = wlTimeSlots.length
    const courts  = Math.max(1, parseInt(wlCourts) || 1)
    const slotsPerDay = slots * courts
    const totalSlots  = days * slotsPerDay
    const totalFixtures = fixtureCount(activeCount)
    const totalGames = wlRepeatRotations ? totalSlots : Math.min(totalSlots, totalFixtures)
    if (!days || !slots || !totalFixtures) return null
    return { days, slots, courts, slotsPerDay, totalGames, totalFixtures }
  }, [mode, wlStartDate, wlEndDate, wlDaysOfWeek, wlTimeSlots, wlCourts, activeCount, wlRepeatRotations])

  const puPreview = useMemo(() => {
    if (mode !== 'pickup') return null
    const days    = countGameDays(puStartDate, puEndDate, puDaysOfWeek)
    const slots   = puTimeSlots.length
    const courts  = Math.max(1, parseInt(puCourts) || 1)
    const slotsPerDay = slots * courts
    const total   = days * slotsPerDay
    if (!days || !slots) return null
    return { days, slots, courts, slotsPerDay, total }
  }, [mode, puStartDate, puEndDate, puDaysOfWeek, puTimeSlots, puCourts])

  const dsEstimate = useMemo(() => {
    if (mode !== 'single_day') return null
    return estimateDayScheduleFinish(
      dsDate, dsTime,
      parseInt(dsGameDuration) || 45,
      parseInt(dsBreak) || 15,
      parseInt(dsCourts) || 2,
      activeCount,
      specialBreaks,
    )
  }, [mode, dsDate, dsTime, dsGameDuration, dsBreak, dsCourts, activeCount, specialBreaks])

  // ── Special break helpers ───────────────────────────────────────────────────
  function addBreak() {
    setSpecialBreaks(prev => [...prev, { id: String(breakCounter++), label: 'Lunch', startTime: '12:00', durationMinutes: '60' }])
  }
  function updateBreak(id: string, field: keyof Omit<SpecialBreak, 'id'>, value: string) {
    setSpecialBreaks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b))
  }
  function removeBreak(id: string) {
    setSpecialBreaks(prev => prev.filter(b => b.id !== id))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    start(async () => {
      let res

      if (mode === 'weekly_league') {
        res = await generateWeeklyLeagueSchedule({
          leagueId,
          daysOfWeek:         wlDaysOfWeek,
          startDate:          wlStartDate,
          endDate:            wlEndDate,
          timeSlots:          wlTimeSlots,
          courts:             parseInt(wlCourts) || 1,
          gameDurationMinutes: parseInt(wlGameDuration) || 60,
          repeatRotations:    wlRepeatRotations,
          ...(useSlotMode ? { expectedTeamCount: activeCount } : {}),
        })
      } else if (mode === 'pickup') {
        res = await generatePickupSchedule({
          leagueId,
          daysOfWeek:         puDaysOfWeek,
          startDate:          puStartDate,
          endDate:            puEndDate,
          timeSlots:          puTimeSlots,
          courts:             parseInt(puCourts) || 1,
          gameDurationMinutes: parseInt(puGameDuration) || 60,
        })
      } else {
        // single_day — original path
        res = await generateRoundRobinSchedule({
          leagueId,
          ...(useSlotMode ? { expectedTeamCount: activeCount } : {}),
          daySchedule: {
            startDate:              dsDate,
            startTime:              dsTime,
            gameDurationMinutes:    parseInt(dsGameDuration) || 45,
            breakBetweenSlotsMinutes: parseInt(dsBreak) || 15,
            courtsAvailable:        parseInt(dsCourts) || 2,
            specialBreaks: specialBreaks
              .filter(b => b.startTime && parseInt(b.durationMinutes) > 0)
              .map(b => ({
                label:           b.label,
                startTime:       b.startTime,
                durationMinutes: parseInt(b.durationMinutes),
              })),
          },
        })
      }

      setResult(res)
      if (!res.error) { router.refresh(); setOpen(false) }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputCls = 'w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400'
  const venueLbl = venueLabel(sport)

  return (
    <div className="bg-white rounded-lg border p-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold"
      >
        <span>⚡ Schedule Generator</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">

          {/* ── Top-level mode toggle ── */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            {([
              ['weekly_league', 'Weekly League'],
              ['pickup',        'Pickup / Drop-in'],
              ['single_day',    'Single Day'],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setResult(null) }}
                className={`flex-1 py-1.5 font-semibold transition-colors ${
                  mode === m
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {result?.error && <p className="text-xs text-red-600">{result.error}</p>}
          {result?.count != null && !result.error && (
            <p className="text-xs text-green-600">
              {result.isTemplate
                ? `Generated ${result.count} template games — assign teams from the schedule table.`
                : `Generated ${result.count} games!`}
            </p>
          )}

          {/* ════════════════════════════════════════════════════════════════
              WEEKLY LEAGUE MODE
          ════════════════════════════════════════════════════════════════ */}
          {mode === 'weekly_league' && (
            <>
              {/* Team count source */}
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

              <DayOfWeekPicker selected={wlDaysOfWeek} onChange={setWlDaysOfWeek} />

              {/* Date range */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Start date *</label>
                  <input type="date" value={wlStartDate} onChange={e => setWlStartDate(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">End date *</label>
                  <input type="date" value={wlEndDate} onChange={e => setWlEndDate(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <TimeSlotList slots={wlTimeSlots} onChange={setWlTimeSlots} />

              {/* Courts + duration */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Simultaneous {venueLbl.toLowerCase()}s</label>
                  <input type="number" min={1} max={20} value={wlCourts} onChange={e => setWlCourts(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Game duration (min)</label>
                  <input type="number" min={5} max={240} value={wlGameDuration} onChange={e => setWlGameDuration(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Repeat rotations */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wlRepeatRotations}
                  onChange={e => setWlRepeatRotations(e.target.checked)}
                  className="rounded mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Repeat schedule when all teams have played each other</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    The fixture list restarts after one full round-robin, filling all remaining game days.
                  </p>
                </div>
              </label>

              {/* Preview */}
              {wlPreview && (
                <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-800 space-y-0.5">
                  <p>
                    <span className="font-semibold">{wlPreview.days}</span> game day{wlPreview.days !== 1 ? 's' : ''}
                    {' · '}<span className="font-semibold">{wlPreview.slots}</span> time slot{wlPreview.slots !== 1 ? 's' : ''}
                    {wlPreview.courts > 1 && <> × <span className="font-semibold">{wlPreview.courts}</span> {venueLbl.toLowerCase()}s</>}
                    {' = '}<span className="font-semibold">{wlPreview.slotsPerDay}</span> game{wlPreview.slotsPerDay !== 1 ? 's' : ''}/day
                  </p>
                  <p className="font-semibold text-blue-900">
                    {wlPreview.totalGames} games total
                    {!wlRepeatRotations && wlPreview.totalGames < wlPreview.days * wlPreview.slotsPerDay && (
                      <span className="font-normal text-blue-600"> (stops after all {wlPreview.totalFixtures} fixtures are used)</span>
                    )}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PICKUP / DROP-IN MODE
          ════════════════════════════════════════════════════════════════ */}
          {mode === 'pickup' && (
            <>
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2">
                Creates blank time slots with no teams assigned — players sign up on game day.
              </p>

              <DayOfWeekPicker selected={puDaysOfWeek} onChange={setPuDaysOfWeek} />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Start date *</label>
                  <input type="date" value={puStartDate} onChange={e => setPuStartDate(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">End date *</label>
                  <input type="date" value={puEndDate} onChange={e => setPuEndDate(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <TimeSlotList slots={puTimeSlots} onChange={setPuTimeSlots} />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Simultaneous {venueLbl.toLowerCase()}s</label>
                  <input type="number" min={1} max={20} value={puCourts} onChange={e => setPuCourts(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Game duration (min)</label>
                  <input type="number" min={5} max={240} value={puGameDuration} onChange={e => setPuGameDuration(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Preview */}
              {puPreview && (
                <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-800 space-y-0.5">
                  <p>
                    <span className="font-semibold">{puPreview.days}</span> day{puPreview.days !== 1 ? 's' : ''}
                    {' · '}<span className="font-semibold">{puPreview.slots}</span> time slot{puPreview.slots !== 1 ? 's' : ''}
                    {puPreview.courts > 1 && <> × <span className="font-semibold">{puPreview.courts}</span> {venueLbl.toLowerCase()}s</>}
                  </p>
                  <p className="font-semibold text-blue-900">{puPreview.total} game slot{puPreview.total !== 1 ? 's' : ''} total</p>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              SINGLE DAY MODE (original)
          ════════════════════════════════════════════════════════════════ */}
          {mode === 'single_day' && (
            <>
              {/* Team count source */}
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

              {/* Stats line */}
              <p className="text-xs text-gray-500">
                {activeCount} teams → {activeCount % 2 === 0 ? activeCount - 1 : activeCount} rounds,{' '}
                {Math.floor(activeCount / 2)} games/round
                {parseInt(dsCourts) > 0 && (
                  <> · {Math.ceil(Math.floor(activeCount / 2) / (parseInt(dsCourts) || 1))} slot{Math.ceil(Math.floor(activeCount / 2) / (parseInt(dsCourts) || 1)) !== 1 ? 's' : ''}/round</>
                )}
              </p>

              {/* Date + time */}
              <div className="grid grid-cols-2 gap-2">
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
              <div className="grid grid-cols-2 gap-2">
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
                <label className="block text-xs text-gray-500 mb-0.5">Simultaneous {venueLbl.toLowerCase()}s</label>
                <input type="number" min={1} max={10} value={dsCourts} onChange={e => setDsCourts(e.target.value)} className={inputCls} />
                <p className="text-xs text-gray-400 mt-0.5">Games in a round fill all courts; overflow spills to the next time slot.</p>
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
                        min={1} max={480}
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
              {dsEstimate && (
                <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-xs text-blue-800">
                  Estimated finish: <span className="font-semibold">{dsEstimate.endTime}</span>
                  <span className="text-blue-600 ml-1">({formatDuration(dsEstimate.totalMinutes)} total)</span>
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
            {pending
              ? 'Generating…'
              : mode === 'pickup'
                ? 'Generate Pickup Slots'
                : mode === 'weekly_league' && useSlotMode
                  ? 'Generate Template Schedule'
                  : 'Generate Schedule'}
          </button>
        </form>
      )}
    </div>
  )
}
