'use client'

import { useState, useTransition } from 'react'
import { createDivision, deleteDivision, setTeamDivision } from '@/actions/divisions'

interface Division {
  id: string
  name: string
  sort_order: number
}

interface Team {
  id: string
  name: string
  division_id: string | null
}

interface Props {
  leagueId: string
  initialDivisions: Division[]
  initialTeams: Team[]
}

export function AdminDivisionsManager({ leagueId, initialDivisions, initialTeams }: Props) {
  const [divisions, setDivisions] = useState(initialDivisions)
  const [teams, setTeams] = useState(initialTeams)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const result = await createDivision(leagueId, newName)
    if (result.error) {
      setFormError(result.error)
    } else {
      setNewName('')
      // Optimistically add a placeholder; server revalidation will refresh
    }
  }

  function handleDelete(divisionId: string) {
    startTransition(async () => {
      const result = await deleteDivision(divisionId, leagueId)
      if (!result.error) {
        setDivisions((prev) => prev.filter((d) => d.id !== divisionId))
        setTeams((prev) =>
          prev.map((t) => (t.division_id === divisionId ? { ...t, division_id: null } : t))
        )
      }
    })
  }

  function handleAssign(teamId: string, divisionId: string | null) {
    startTransition(async () => {
      const result = await setTeamDivision(teamId, leagueId, divisionId)
      if (!result.error) {
        setTeams((prev) =>
          prev.map((t) => (t.id === teamId ? { ...t, division_id: divisionId } : t))
        )
      }
    })
  }

  const unassigned = teams.filter((t) => !t.division_id)

  return (
    <div className="space-y-6">
      {/* Create division */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Division name (e.g. Division A, Recreational)"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <button
          type="submit"
          disabled={!newName.trim() || isPending}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Add Division
        </button>
      </form>
      {formError && <p className="text-red-500 text-xs -mt-4">{formError}</p>}

      {divisions.length === 0 && (
        <div className="bg-white border rounded-lg px-6 py-10 text-center text-gray-400 text-sm">
          No divisions yet. Add one above to start organising teams.
        </div>
      )}

      {/* Division cards */}
      {divisions.map((div) => {
        const divTeams = teams.filter((t) => t.division_id === div.id)
        return (
          <div key={div.id} className="bg-white border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
              <p className="font-semibold text-sm">{div.name}</p>
              <button
                onClick={() => handleDelete(div.id)}
                disabled={isPending}
                className="text-xs text-red-500 hover:underline disabled:opacity-40"
              >
                Delete
              </button>
            </div>
            <ul className="divide-y">
              {divTeams.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm font-medium">{t.name}</span>
                  <button
                    onClick={() => handleAssign(t.id, null)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {divTeams.length === 0 && (
                <li className="px-5 py-4 text-xs text-gray-400">No teams assigned yet.</li>
              )}
            </ul>
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
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    disabled={isPending || divisions.length === 0}
                    onChange={(e) => {
                      if (e.target.value) handleAssign(t.id, e.target.value)
                    }}
                    className="border rounded-md px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value="" disabled>Assign to…</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
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
