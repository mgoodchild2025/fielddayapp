'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignSlotToTeam } from '@/actions/schedule'

interface Team {
  id: string
  name: string
}

interface Props {
  leagueId: string
  /** Unmatched placeholder labels, e.g. ["Team 1", "Team 2", "Team 4"] */
  slotLabels: string[]
  teams: Team[]
}

export function AssignSlotsCard({ leagueId, slotLabels, teams }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(slotLabels.map(l => [l, '']))
  )
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Don't render if nothing to map or no real teams to map to
  if (slotLabels.length === 0 || teams.length === 0) return null

  function handleChange(slot: string, teamId: string) {
    setAssignments(prev => ({ ...prev, [slot]: teamId }))
    setSuccess(null)
    setError(null)
  }

  function handleSave() {
    const toAssign = slotLabels
      .filter(l => assignments[l])
      .map(l => ({ slotLabel: l, teamId: assignments[l] }))

    if (toAssign.length === 0) {
      setError('Select at least one team to assign.')
      return
    }

    setSuccess(null)
    setError(null)
    startTransition(async () => {
      const result = await assignSlotToTeam({ leagueId, assignments: toAssign })
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(
          `${result.count} slot${result.count !== 1 ? 's' : ''} assigned. Games updated.`
        )
        // Clear the saved slots from local state
        setAssignments(prev => {
          const next = { ...prev }
          toAssign.forEach(({ slotLabel }) => { next[slotLabel] = '' })
          return next
        })
        router.refresh()
      }
    })
  }

  // Which team IDs are already picked (prevent double-assigning)
  const picked = new Set(Object.values(assignments).filter(Boolean))

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Assign Teams to Slots</h3>
        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
          {slotLabels.length} unassigned
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Map placeholder slots from the generated schedule to real teams.
      </p>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs mb-3">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-3">
        {slotLabels.map(slot => (
          <div key={slot} className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 w-16 shrink-0 truncate" title={slot}>
              {slot}
            </span>
            <span className="text-gray-300 text-xs">→</span>
            <select
              value={assignments[slot] ?? ''}
              onChange={e => handleChange(slot, e.target.value)}
              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              <option value="">— assign later —</option>
              {teams.map(t => (
                <option
                  key={t.id}
                  value={t.id}
                  // Dim teams already selected elsewhere (still selectable)
                  className={picked.has(t.id) && assignments[slot] !== t.id ? 'text-gray-400' : ''}
                >
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={pending || Object.values(assignments).every(v => !v)}
        className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {pending ? 'Saving…' : 'Save assignments'}
      </button>
    </div>
  )
}
