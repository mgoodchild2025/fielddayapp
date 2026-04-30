'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTeam } from '@/actions/teams'

const PRESET_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280']

interface Props {
  leagueId: string
}

export function PlayerCreateTeamForm({ leagueId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) {
      setError('Team name must be at least 2 characters.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createTeam({
        leagueId,
        name: name.trim(),
        color: selectedColor || undefined,
      })
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        router.push(`/teams/${result.data.id}`)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-md text-sm font-semibold border-2 border-dashed transition-colors hover:border-solid"
        style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
      >
        + Create a New Team
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Create Your Team</h3>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Spikers"
            className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Team Colour <span className="text-gray-400 font-normal">(optional)</span></label>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(selectedColor === color ? '' : color)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Creating…' : 'Create Team'}
        </button>
      </form>
    </div>
  )
}
