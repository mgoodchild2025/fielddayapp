'use client'

import { useState, useTransition } from 'react'
import { addOrgPosition, removeOrgPosition, resetOrgPositions } from '@/actions/positions'
import type { SportPosition } from '@/actions/positions'

interface Props {
  sport: string
  positions: SportPosition[]
  isCustom: boolean
}

export function PositionsEditor({ sport, positions: initialPositions, isCustom }: Props) {
  const [positions, setPositions] = useState(initialPositions)
  const [customized, setCustomized] = useState(isCustom)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setAddError(null)

    // Optimistic add
    const optimistic: SportPosition = { id: `opt-${Date.now()}`, sport, name, display_order: positions.length + 1, organization_id: 'pending' }
    setPositions(prev => [...prev, optimistic])
    setNewName('')
    setCustomized(true)

    startTransition(async () => {
      const result = await addOrgPosition({ sport, name })
      if (result.error) {
        setAddError(result.error)
        setPositions(prev => prev.filter(p => p.id !== optimistic.id))
      }
    })
  }

  function handleRemove(id: string) {
    setPositions(prev => prev.filter(p => p.id !== id))
    startTransition(async () => {
      const result = await removeOrgPosition(id)
      if (result.error) {
        // refetch isn't possible here without a full rerender — just show the error
        // the parent server component will re-render on next navigation
        setAddError(result.error)
      }
    })
  }

  function handleReset() {
    if (!confirm('Reset to platform defaults? Your custom positions for this sport will be deleted.')) return
    setCustomized(false)
    startTransition(async () => {
      const result = await resetOrgPositions(sport)
      if (result.error) {
        setAddError(result.error)
        setCustomized(true)
      }
      // The server revalidates the path, so the list will refresh on next navigation.
      // For immediate feedback, clear the local state to signal "using defaults."
      setPositions([])
    })
  }

  return (
    <div>
      <ul className="divide-y">
        {positions.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2 px-1">
            <span className="text-sm">{p.name}</span>
            {customized && (
              <button
                onClick={() => handleRemove(p.id)}
                disabled={isPending}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 px-1"
                title="Remove position"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {positions.length === 0 && (
          <li className="py-2 text-sm text-gray-400 italic">
            {customized ? 'No positions. Add one below.' : 'Using platform defaults (reload to see them).'}
          </li>
        )}
      </ul>

      {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}

      <form onSubmit={handleAdd} className="flex gap-2 mt-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New position name"
          maxLength={100}
          className="flex-1 border rounded-md px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Add
        </button>
      </form>

      {customized && (
        <button
          onClick={handleReset}
          disabled={isPending}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
        >
          Reset to platform defaults
        </button>
      )}
    </div>
  )
}
