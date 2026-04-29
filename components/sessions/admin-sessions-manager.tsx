'use client'

import { useState, useTransition } from 'react'
import { createSession, cancelSession, deleteSession } from '@/actions/sessions'

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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

export function AdminSessionsManager({ leagueId, initialSessions }: Props) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createSession(leagueId, {
      scheduled_at: fd.get('scheduled_at') as string,
      duration_minutes: Number(fd.get('duration_minutes') || 90),
      capacity: fd.get('capacity') ? Number(fd.get('capacity')) : undefined,
      location_override: fd.get('location_override') as string,
      notes: fd.get('notes') as string,
    })
    if (result.error) {
      setFormError(result.error)
    } else {
      setShowForm(false)
      ;(e.target as HTMLFormElement).reset()
    }
  }

  function handleCancel(sessionId: string) {
    startTransition(async () => {
      const result = await cancelSession(sessionId, leagueId)
      if (!result.error) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' } : s))
        )
      }
    })
  }

  function handleDelete(sessionId: string) {
    startTransition(async () => {
      const result = await deleteSession(sessionId, leagueId)
      if (!result.error) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {showForm ? 'Cancel' : '+ Add Session'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border rounded-lg p-5 space-y-4"
        >
          <p className="font-semibold text-sm">New Session</p>
          {formError && <p className="text-red-500 text-xs">{formError}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date &amp; Time *</label>
              <input
                name="scheduled_at"
                type="datetime-local"
                required
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Duration (minutes)</label>
              <input
                name="duration_minutes"
                type="number"
                defaultValue={90}
                min={15}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Capacity (blank = unlimited)</label>
              <input
                name="capacity"
                type="number"
                min={1}
                placeholder="Unlimited"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Location Override</label>
              <input
                name="location_override"
                type="text"
                placeholder="Leave blank to use event venue"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              name="notes"
              type="text"
              placeholder="e.g. Court 3 only, bring your own net"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2 rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Save Session
          </button>
        </form>
      )}

      {sessions.length === 0 && !showForm && (
        <div className="bg-white border rounded-lg px-6 py-12 text-center text-gray-400 text-sm">
          No sessions scheduled yet. Add the first one above.
        </div>
      )}

      {sessions.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Date &amp; Time</th>
                <th className="px-4 py-3 font-medium text-gray-500">Duration</th>
                <th className="px-4 py-3 font-medium text-gray-500">Spots</th>
                <th className="px-4 py-3 font-medium text-gray-500">Location</th>
                <th className="px-4 py-3 font-medium text-gray-500">Notes</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={`border-b last:border-0 ${s.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{formatDateTime(s.scheduled_at)}</td>
                  <td className="px-4 py-3 text-gray-500">{s.duration_minutes} min</td>
                  <td className="px-4 py-3">
                    <SpotsLabel count={s.registered_count} capacity={s.capacity} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.location_override ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{s.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    {s.status === 'cancelled' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Cancelled</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Open</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {s.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancel(s.id)}
                          disabled={isPending}
                          className="text-xs text-amber-600 hover:underline disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={isPending}
                        className="text-xs text-red-500 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
