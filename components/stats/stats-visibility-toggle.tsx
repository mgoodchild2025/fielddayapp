'use client'

import { useState, useTransition } from 'react'
import { updateStatsPublic } from '@/actions/stats'

interface Props {
  leagueId: string
  initialValue: boolean
}

export function StatsVisibilityToggle({ leagueId, initialValue }: Props) {
  const [isPublic, setIsPublic] = useState(initialValue)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !isPublic
    setIsPublic(next)
    setError(null)
    startTransition(async () => {
      const res = await updateStatsPublic(leagueId, next)
      if (res.error) {
        setIsPublic(!next) // revert
        setError(res.error)
      }
    })
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h2 className="font-semibold text-sm mb-3">Stats Visibility</h2>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="flex items-center justify-between w-full group"
        aria-pressed={isPublic}
      >
        <span className="text-sm text-gray-600">
          {isPublic ? 'Visible to everyone' : 'Members only'}
        </span>
        {/* Toggle track */}
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
            pending ? 'opacity-50' : ''
          }`}
          style={{ backgroundColor: isPublic ? 'var(--brand-primary)' : '#D1D5DB' }}
        >
          {/* Toggle thumb */}
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
              isPublic ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </span>
      </button>
      <p className="text-xs text-gray-400 mt-2">
        {isPublic
          ? 'Stats leaderboard is public — visible to anyone, including non-members.'
          : 'Stats are members-only — only logged-in users can view them.'}
      </p>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
