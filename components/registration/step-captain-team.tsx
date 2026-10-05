'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createTeam } from '@/actions/teams'

interface Props {
  leagueId: string
  captainTeamId: string | null
  captainTeamName: string | null
  /** The flow's header carries the labelled Back; only render one here when asked. */
  onBack?: () => void
}

export function StepCaptainTeam({ leagueId, captainTeamId, captainTeamName, onBack }: Props) {
  const router = useRouter()
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous guard: Enter + a tap (or two Enters) inside one render both saw
  // loading=false and created two teams.
  const creating = useRef(false)

  // Already have a team — just send them to it
  if (captainTeamId && captainTeamName) {
    return (
      <div className="bg-white rounded-lg border p-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto text-2xl">
          ✅
        </div>
        <div>
          <h2 className="font-semibold text-lg">You&apos;re already a captain!</h2>
          <p className="text-sm text-gray-500 mt-1">
            Your team <strong>{captainTeamName}</strong> is set up. Head to your team page to manage your roster and complete payment.
          </p>
        </div>
        <Link
          href={`/teams/${captainTeamId}`}
          className="press flex items-center justify-center w-full min-h-11 rounded-md font-semibold bg-brand-primary text-on-brand"
        >
          Go to my team &amp; pay →
        </Link>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="press inline-flex items-center min-h-10 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
        )}
      </div>
    )
  }

  async function handleCreate() {
    const name = teamName.trim()
    if (!name) { setError('Please enter a team name.'); return }
    if (creating.current) return
    creating.current = true
    setLoading(true)
    setError(null)
    let result: Awaited<ReturnType<typeof createTeam>>
    try {
      result = await createTeam({ leagueId, name })
    } catch {
      result = { error: "Couldn't reach the server — check your connection and try again.", data: null } as Awaited<ReturnType<typeof createTeam>>
    }
    if (result.error) {
      setError(result.error === 'EVENT_FULL'
        ? 'Sorry, this event is full — no more team spots are available.'
        : result.error)
      setLoading(false)
      creating.current = false
      return
    }
    // Stays "Creating team…" (and guarded) until the team page loads.
    router.push(`/teams/${result.data!.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Create your team</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Give your team a name. You&apos;ll be able to invite players and pay from your team page.
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <div>
          <label htmlFor="captain-team-name" className="block text-sm font-medium text-gray-700 mb-1">Team name *</label>
          <input
            id="captain-team-name"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
            placeholder="e.g. The Spikers"
            className="w-full border rounded-md px-3 py-2 text-base"
            autoFocus
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !teamName.trim()}
          className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Creating team…' : 'Create team & continue →'}
        </button>
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="press inline-flex items-center min-h-10 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back
        </button>
      )}
    </div>
  )
}
