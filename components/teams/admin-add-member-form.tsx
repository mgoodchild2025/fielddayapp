'use client'

import { useState } from 'react'
import { adminAddTeamMember } from '@/actions/teams'

interface Props {
  teamId: string
  leagueId: string
}

export function AdminAddMemberForm({ teamId, leagueId }: Props) {
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

    const submittedEmail = email
    const result = await adminAddTeamMember({ teamId, leagueId, email, role })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccessMsg(
        result.invited
          ? `Invite recorded for ${submittedEmail}. They'll be added to the team when they create an account.`
          : `${submittedEmail} added to the team.`
      )
      setEmail('')
      setRole('player')
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          required
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
        disabled={loading}
        className="w-full py-2 px-4 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Adding…' : 'Add Player'}
      </button>
    </form>
  )
}
