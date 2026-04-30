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

type Mode = 'registered' | 'email'

export function AdminAddMemberForm({ teamId, leagueId, registeredPlayers = [] }: Props) {
  const hasRegistered = registeredPlayers.length > 0
  const [mode, setMode] = useState<Mode>(hasRegistered ? 'registered' : 'email')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'player' | 'captain'>('player')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    let submittedEmail = email
    if (mode === 'registered' && selectedUserId) {
      const player = registeredPlayers.find((p) => p.userId === selectedUserId)
      submittedEmail = player?.email ?? ''
    }

    const result = await adminAddTeamMember({ teamId, leagueId, email: submittedEmail, role })

    if (result.error) {
      setError(result.error)
    } else {
      const displayName =
        mode === 'registered'
          ? (registeredPlayers.find((p) => p.userId === selectedUserId)?.name ?? submittedEmail)
          : submittedEmail
      setSuccessMsg(
        result.invited
          ? `Invite sent to ${displayName}.`
          : `${displayName} added to the team.`
      )
      setSelectedUserId('')
      setEmail('')
      setRole('player')
    }

    setLoading(false)
  }

  const canSubmit = mode === 'registered' ? !!selectedUserId : !!email

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Mode toggle — only show when there are registered players */}
      {hasRegistered && (
        <div className="flex rounded-md border overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => { setMode('registered'); setError(null); setSuccessMsg(null) }}
            className={`flex-1 py-1.5 transition-colors ${mode === 'registered' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Registered Player
          </button>
          <button
            type="button"
            onClick={() => { setMode('email'); setError(null); setSuccessMsg(null) }}
            className={`flex-1 py-1.5 transition-colors ${mode === 'email' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Invite by Email
          </button>
        </div>
      )}

      {mode === 'registered' && hasRegistered ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Player
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a player…</option>
            {registeredPlayers.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}{p.email ? ` (${p.email})` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            They&apos;ll receive an invite email with a link to join the team.
          </p>
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
        disabled={loading || !canSubmit}
        className="w-full py-2 px-4 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Adding…' : mode === 'email' ? 'Send Invite' : 'Add Player'}
      </button>
    </form>
  )
}
