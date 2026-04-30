'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSession, updateSession, cancelSession, deleteSession } from '@/actions/sessions'

interface Session {
  id: string
  scheduled_at: string
  duration_minutes: number
  capacity: number | null
  location_override: string | null
  notes: string | null
  status: string
  registered_count: number
}

interface Props {
  leagueId: string
  initialSessions: Session[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toLocalDatetime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', {
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

// ── Create form ───────────────────────────────────────────────────────────────

function CreateForm({ leagueId, onDone }: { leagueId: string; onDone: () => void }) {
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

function EditForm({ session, leagueId, onDone }: { session: Session; leagueId: string; onDone: () => void }) {
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
            defaultValue={toLocalDatetime(session.scheduled_at)}
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

export function AdminSessionsManager({ leagueId, initialSessions }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sessions = initialSessions

  function handleCancel(sessionId: string) {
    startTransition(async () => {
      await cancelSession(sessionId, leagueId)
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
        <CreateForm leagueId={leagueId} onDone={() => setShowCreate(false)} />
      )}

      {sessions.length === 0 && !showCreate && (
        <div className="bg-white border rounded-lg px-6 py-12 text-center text-gray-400 text-sm">
          No sessions scheduled yet. Add the first one above.
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id}>
              {editingId === s.id ? (
                <EditForm session={s} leagueId={leagueId} onDone={() => setEditingId(null)} />
              ) : (
                <div className={`bg-white border rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 ${s.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <div className="min-w-[180px]">
                    <p className="font-medium text-sm">{formatDateTime(s.scheduled_at)}</p>
                    <p className="text-xs text-gray-400">{s.duration_minutes} min</p>
                  </div>

                  <SpotsLabel count={s.registered_count} capacity={s.capacity} />

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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
