'use client'

import { useState } from 'react'
import { adminAddTeamMember } from '@/actions/teams'

interface RegisteredPlayer {
  userId: string
  name: string
  email: string
}

interface Props {
  teamId: string
  leagueId: string
  registeredPlayers?: RegisteredPlayer[]
}

export function AdminAddMemberForm({ teamId, leagueId, registeredPlayers }: Props) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'player' | 'captain'>('player')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const hasRegisteredPlayers = registeredPlayers && registeredPlayers.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    let submittedEmail = email
    if (hasRegisteredPlayers && selectedUserId) {
      const player = registeredPlayers!.find((p) => p.userId === selectedUserId)
      submittedEmail = player?.email ?? ''
    }

    const result = await adminAddTeamMember({ teamId, leagueId, email: submittedEmail, role })

    if (result.error) {
      setError(result.error)
    } else {
      const displayName = hasRegisteredPlayers
        ? registeredPlayers!.find((p) => p.userId === selectedUserId)?.name ?? submittedEmail
        : submittedEmail
      setSuccessMsg(
        result.invited
          ? `Invite recorded for ${displayName}.`
          : `${displayName} added to the team.`
      )
      setSelectedUserId('')
      setEmail('')
      setRole('player')
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {hasRegisteredPlayers ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Registered Player
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a player…</option>
            {registeredPlayers!.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}{p.email ? ` (${p.email})` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {registeredPlayers?.length === 0 ? 'Email (all registered players are on a team)' : 'Email'}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'player' | 'captain')}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="player">Player</option>
          <option value="captain">Captain</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

      <button
        type="submit"
        disabled={loading || (hasRegisteredPlayers ? !selectedUserId : !email)}
        className="w-full py-2 px-4 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Adding…' : 'Add Player'}
      </button>
    </form>
  )
}
