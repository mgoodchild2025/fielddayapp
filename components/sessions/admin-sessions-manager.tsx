'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSession, updateSession, cancelSession, reopenSession, deleteSession } from '@/actions/sessions'
import { moveRegistrationToSession } from '@/actions/registrations'
import { AdminAddRegistrant } from '@/components/registration/admin-add-registrant'

interface SessionOption { id: string; label: string }

interface RosterEntry {
  name: string
  isGuest: boolean
  payment: 'paid' | 'owed' | 'free'
  /** A full-pass holder who attends every session (vs a single-session drop-in). */
  allSessions: boolean
  /** Drop-in registration id — present (and movable) for per-session registrations. */
  registrationId?: string
}

interface Session {
  id: string
  scheduled_at: string
  duration_minutes: number
  capacity: number | null
  location_override: string | null
  notes: string | null
  status: string
  registered_count: number
  /** Drop-in registrations for this session from the registrations table (new flow) */
  dropin_count?: number
  /** Per-session registrant list (drop-in + join-button flows) */
  roster?: RosterEntry[]
}

interface Props {
  leagueId: string
  initialSessions: Session[]
  timezone: string
  /** 'season' = all registrants attend every session; 'session' = per-session sign-up */
  registrationMode?: string
  /** Count of active season registrations — used as registered count for season-pass events */
  seasonRegistrantCount?: number
  /** League-level max_participants — used as capacity fallback when session has no capacity set */
  eventCapacity?: number | null
  /** All sessions (id + label) — used for the move-to-session picker and add-player. */
  sessionOptions?: SessionOption[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Convert a UTC ISO string to a naive "YYYY-MM-DDTHH:mm" local string for a datetime-local input. */
function toLocalDatetime(iso: string, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  const h = parts.hour === '24' ? '00' : parts.hour  // Intl sometimes returns 24 for midnight
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`
}

function formatDateTime(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-CA', {
    timeZone: timezone,
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function SpotsLabel({ count, capacity }: { count: number; capacity: number | null }) {
  if (capacity === null) return <span className="text-gray-500 text-xs">{count} registered</span>
  const remaining = capacity - count
  return (
    <span className={`text-xs font-medium ${remaining === 0 ? 'text-red-600' : remaining <= 3 ? 'text-amber-600' : 'text-gray-500'}`}>
      {remaining === 0 ? 'Full' : `${remaining} / ${capacity} spots`}
    </span>
  )
}

const INPUT = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]'
const LABEL = 'block text-xs font-medium text-gray-700 mb-1'

// ── Roster panel ──────────────────────────────────────────────────────────────

function PaymentBadge({ payment }: { payment: RosterEntry['payment'] }) {
  if (payment === 'paid') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Paid</span>
  }
  if (payment === 'owed') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Owes at venue</span>
  }
  return null
}

/** Per-registrant "Move to another session" control. */
function MoveControl({
  registrationId,
  leagueId,
  currentSessionId,
  sessionOptions,
}: {
  registrationId: string
  leagueId: string
  currentSessionId: string
  sessionOptions: SessionOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const targets = sessionOptions.filter((s) => s.id !== currentSessionId)
  if (targets.length === 0) return null

  return (
    <span className="flex items-center gap-1">
      <select
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          const sessionId = e.target.value
          if (!sessionId) return
          setError(null)
          startTransition(async () => {
            const res = await moveRegistrationToSession({ registrationId, leagueId, sessionId })
            if (res.error) { setError(res.error); return }
            router.refresh()
          })
        }}
        className="border rounded-md px-1.5 py-0.5 text-[11px] bg-white text-gray-600 focus:outline-none disabled:opacity-50"
        title="Move to another session"
      >
        <option value="">{pending ? 'Moving…' : 'Move to…'}</option>
        {targets.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  )
}

function RosterPanel({
  roster,
  sessionId,
  leagueId,
  sessionOptions = [],
}: {
  roster: RosterEntry[]
  sessionId: string
  leagueId: string
  sessionOptions?: SessionOption[]
}) {
  return (
    <div className="bg-gray-50 border border-t-0 rounded-b-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Registered ({roster.length})
        </p>
        <AdminAddRegistrant
          leagueId={leagueId}
          sessions={sessionOptions}
          defaultSessionId={sessionId}
          triggerLabel="Add player"
          triggerClassName="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
        />
      </div>
      {roster.length === 0 ? (
        <p className="text-xs text-gray-400">No one has registered for this session yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {roster.map((r, i) => (
            <li key={r.registrationId ?? i} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="text-gray-800">{r.name}</span>
              {r.isGuest && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">Guest</span>
              )}
              {r.allSessions && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">All sessions</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <PaymentBadge payment={r.payment} />
                {r.registrationId && (
                  <MoveControl
                    registrationId={r.registrationId}
                    leagueId={leagueId}
                    currentSessionId={sessionId}
                    sessionOptions={sessionOptions}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateForm({ leagueId, timezone, onDone }: { leagueId: string; timezone: string; onDone: () => void }) {
  const router = useRouter()
  const [repeat, setRepeat] = useState(false)
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleDay(d: number) {
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  }

  function handleDateChange(val: string) {
    if (repeat && val) {
      const dow = new Date(val).getDay()
      if (!selectedDays.includes(dow)) setSelectedDays((prev) => [...prev, dow])
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createSession(leagueId, {
      scheduled_at: fd.get('scheduled_at') as string,
      duration_minutes: Number(fd.get('duration_minutes') || 90),
      capacity: fd.get('capacity') ? Number(fd.get('capacity')) : undefined,
      location_override: fd.get('location_override') as string,
      notes: fd.get('notes') as string,
      repeat_days: repeat ? selectedDays : undefined,
      repeat_until: repeat ? (fd.get('repeat_until') as string) : undefined,
    })
    if (result.error) { setFormError(result.error); return }
    onDone()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-5 space-y-4">
      <p className="font-semibold text-sm">New Session</p>
      {formError && <p className="text-red-500 text-xs">{formError}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Date &amp; Time *</label>
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            className={INPUT}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL}>Duration (minutes)</label>
          <input name="duration_minutes" type="number" defaultValue={90} min={15} className={INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Capacity (blank = unlimited)</label>
          <input name="capacity" type="number" min={1} placeholder="Unlimited" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Location</label>
          <input name="location_override" type="text" placeholder="Leave blank to use event venue" className={INPUT} />
        </div>
      </div>

      <div>
        <label className={LABEL}>Notes</label>
        <input name="notes" type="text" placeholder="e.g. Court 3 only, bring your own net" className={INPUT} />
      </div>

      {/* Repeat toggle */}
      <div className="border-t pt-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm font-medium">Repeat weekly</span>
        </label>

        {repeat && (
          <div className="space-y-3 pl-1">
            <div>
              <p className={LABEL}>Repeat on</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      selectedDays.includes(i)
                        ? 'text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    style={selectedDays.includes(i) ? { backgroundColor: 'var(--brand-primary)' } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-w-xs">
              <label className={LABEL}>Repeat until *</label>
              <input name="repeat_until" type="date" required={repeat} className={INPUT} />
            </div>
            {selectedDays.length > 0 && (
              <p className="text-xs text-gray-500">
                Sessions will be created every {selectedDays.map((d) => DAYS[d]).join(', ')} until the end date.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-md text-sm border text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || (repeat && selectedDays.length === 0)}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : repeat ? 'Create Sessions' : 'Create Session'}
        </button>
      </div>
    </form>
  )
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({ session, leagueId, timezone, onDone }: { session: Session; leagueId: string; timezone: string; onDone: () => void }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateSession(session.id, leagueId, {
        scheduled_at: fd.get('scheduled_at') as string,
        duration_minutes: Number(fd.get('duration_minutes') || 90),
        capacity: fd.get('capacity') ? Number(fd.get('capacity')) : undefined,
        location_override: fd.get('location_override') as string,
        notes: fd.get('notes') as string,
      })
      if (result.error) { setFormError(result.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
      <p className="font-semibold text-sm text-blue-900">Edit Session</p>
      {formError && <p className="text-red-500 text-xs">{formError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Date &amp; Time *</label>
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            defaultValue={toLocalDatetime(session.scheduled_at, timezone)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Duration (minutes)</label>
          <input name="duration_minutes" type="number" defaultValue={session.duration_minutes} min={15} className={INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Capacity (blank = unlimited)</label>
          <input name="capacity" type="number" min={1} defaultValue={session.capacity ?? ''} placeholder="Unlimited" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Location</label>
          <input name="location_override" type="text" defaultValue={session.location_override ?? ''} placeholder="Event venue" className={INPUT} />
        </div>
      </div>

      <div>
        <label className={LABEL}>Notes</label>
        <input name="notes" type="text" defaultValue={session.notes ?? ''} className={INPUT} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-1.5 rounded-md text-sm border text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

// ── Main manager ──────────────────────────────────────────────────────────────

export function AdminSessionsManager({ leagueId, initialSessions, timezone, registrationMode, seasonRegistrantCount = 0, eventCapacity = null, sessionOptions = [] }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [isPending, startTransition] = useTransition()

  const sessions = initialSessions

  // Split into upcoming vs past by end time (so an in-progress session stays
  // "upcoming"). Upcoming is soonest-first; past is most-recent-first.
  const now = Date.now()
  const sessionEnd = (s: Session) => new Date(s.scheduled_at).getTime() + (s.duration_minutes ?? 0) * 60_000
  const upcoming = sessions.filter((s) => sessionEnd(s) >= now)
  const past = sessions.filter((s) => sessionEnd(s) < now).reverse()

  function handleCancel(sessionId: string) {
    startTransition(async () => {
      await cancelSession(sessionId, leagueId)
      router.refresh()
    })
  }

  function handleReopen(sessionId: string) {
    startTransition(async () => {
      await reopenSession(sessionId, leagueId)
      router.refresh()
    })
  }

  function handleDelete(sessionId: string) {
    startTransition(async () => {
      await deleteSession(sessionId, leagueId)
      setConfirmDeleteId(null)
      router.refresh()
    })
  }

  const renderSession = (s: Session) => (
    <div key={s.id}>
              {editingId === s.id ? (
                <EditForm session={s} leagueId={leagueId} timezone={timezone} onDone={() => setEditingId(null)} />
              ) : (
                <>
                <div className={`bg-white border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 ${expandedId === s.id ? 'rounded-t-lg border-b-0' : 'rounded-lg'} ${s.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <div className="min-w-[180px]">
                    <p className="font-medium text-sm">{formatDateTime(s.scheduled_at, timezone)}</p>
                    <p className="text-xs text-gray-400">{s.duration_minutes} min</p>
                  </div>

                  {(() => {
                    // Full-pass holders (seasonRegistrantCount) attend every session;
                    // session-mode events add their per-session sign-ups on top.
                    const count = seasonRegistrantCount + (registrationMode === 'season' ? 0 : s.registered_count) + (s.dropin_count ?? 0)
                    const isOpen = expandedId === s.id
                    return (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : s.id)}
                        className="flex items-center gap-1.5 hover:opacity-70 cursor-pointer"
                        aria-expanded={isOpen}
                        title="View roster / add players"
                      >
                        <SpotsLabel
                          count={count}
                          capacity={s.capacity ?? (registrationMode === 'season' ? eventCapacity : null)}
                        />
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })()}

                  {s.location_override && (
                    <span className="text-xs text-gray-500">{s.location_override}</span>
                  )}

                  {s.notes && (
                    <span className="text-xs text-gray-400 italic truncate max-w-xs">{s.notes}</span>
                  )}

                  <div className="ml-auto flex items-center gap-3">
                    {s.status === 'cancelled' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Open</span>
                    )}

                    {s.status === 'cancelled' && (
                      <button
                        onClick={() => handleReopen(s.id)}
                        disabled={isPending}
                        className="text-xs font-medium text-green-600 hover:underline disabled:opacity-40"
                      >
                        Reopen
                      </button>
                    )}

                    {s.status !== 'cancelled' && (
                      <button
                        onClick={() => { setEditingId(s.id); setShowCreate(false) }}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}

                    {s.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancel(s.id)}
                        disabled={isPending}
                        className="text-xs text-amber-600 hover:underline disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    )}

                    {confirmDeleteId === s.id ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">Delete?</span>
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={isPending}
                          className="text-red-600 font-medium hover:underline disabled:opacity-40"
                        >
                          {isPending ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-gray-500 hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {expandedId === s.id && (
                  <RosterPanel
                    roster={s.roster ?? []}
                    sessionId={s.id}
                    leagueId={leagueId}
                    sessionOptions={sessionOptions}
                  />
                )}
                </>
              )}
            </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setShowCreate((v) => !v); setEditingId(null) }}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {showCreate ? 'Cancel' : '+ Add Session'}
        </button>
      </div>

      {showCreate && (
        <CreateForm leagueId={leagueId} timezone={timezone} onDone={() => setShowCreate(false)} />
      )}

      {sessions.length === 0 && !showCreate && (
        <div className="bg-white border rounded-lg px-6 py-12 text-center text-gray-400 text-sm">
          No sessions scheduled yet. Add the first one above.
        </div>
      )}

      {/* Upcoming sessions — the focus, soonest first */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          {upcoming.map(renderSession)}
        </div>
      )}

      {sessions.length > 0 && upcoming.length === 0 && !showCreate && (
        <div className="bg-white border rounded-lg px-6 py-8 text-center text-gray-400 text-sm">
          No upcoming sessions.
        </div>
      )}

      {/* Past sessions — collapsed by default, most recent first */}
      {past.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
            aria-expanded={showPast}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showPast ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showPast ? 'Hide' : 'Show'} {past.length} past session{past.length !== 1 ? 's' : ''}
          </button>
          {showPast && (
            <div className="space-y-2 mt-2">
              {past.map(renderSession)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
