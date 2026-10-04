'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Which session to check in. One wrapping pill per session buried the roster
 * under 30+ pills on a weekly drop-in, so it's a single select (the page
 * already defaults it to today's session). Navigation dims nothing — the
 * select shows the pending state itself.
 */
export function SessionPicker({
  leagueId,
  sessions,
  selectedId,
}: {
  leagueId: string
  sessions: { id: string; label: string; cancelled: boolean }[]
  selectedId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <select
      aria-label="Session"
      value={selectedId ?? ''}
      disabled={isPending}
      onChange={(e) => {
        const id = e.target.value
        startTransition(() => router.push(`/admin/events/${leagueId}/checkin?session=${id}`))
      }}
      className="w-full sm:w-auto min-h-11 border rounded-lg px-3 text-sm font-medium bg-white disabled:opacity-60"
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}{s.cancelled ? ' (cancelled)' : ''}
        </option>
      ))}
    </select>
  )
}
