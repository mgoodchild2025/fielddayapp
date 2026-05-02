'use client'

import { useState, useTransition } from 'react'
import { captainSetMemberRole, captainRemoveTeamMember, captainAddPlayerByEmail } from '@/actions/teams'
import { setTeamMemberPosition } from '@/actions/positions'
import { PlayerAvatar } from '@/components/ui/player-avatar'

type Role = 'captain' | 'coach' | 'player' | 'sub'

const ROLES: { value: Role; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'sub', label: 'Sub' },
]

interface Member {
  id: string
  role: string
  position: string | null
  userId: string | null
  isMe: boolean
  name: string
  email: string
  avatarUrl?: string | null
}

interface Props {
  teamId: string
  initialMembers: Member[]
  positions?: string[]
}

export function CaptainRosterManager({ teamId, initialMembers, positions = [] }: Props) {
  const [members, setMembers] = useState(initialMembers)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<Role>('player')
  const [addPending, startAddTransition] = useTransition()
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)

  function handlePositionChange(memberId: string, position: string) {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, position: position || null } : m))
    startAddTransition(async () => {
      await setTeamMemberPosition({ memberId, teamId, position })
    })
  }

  function handleRoleChange(memberId: string, role: Role) {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role } : m))
    startAddTransition(async () => {
      const result = await captainSetMemberRole(memberId, teamId, role)
      if (result.error) {
        // revert on error
        setMembers(initialMembers)
      }
    })
  }

  function handleRemove(memberId: string) {
    if (!confirm('Remove this player from the team?')) return
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    startAddTransition(async () => {
      const result = await captainRemoveTeamMember(memberId, teamId)
      if (result.error) {
        setMembers(initialMembers)
      }
    })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddSuccess(null)
    startAddTransition(async () => {
      const result = await captainAddPlayerByEmail({ teamId, email: addEmail, role: addRole })
      if (result.error) {
        setAddError(result.error)
      } else {
        setAddSuccess(`Invite sent to ${addEmail} — they'll appear on the roster once they accept.`)
        setAddEmail('')
        setAddRole('player')
      }
    })
  }

  return (
    <div className="mt-6 bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Manage Roster</h2>
        <span className="text-xs text-gray-400">{members.length} player{members.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Member rows */}
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="px-4 py-3">
            {/* Top row: avatar + name + remove */}
            <div className="flex items-center gap-3">
              <PlayerAvatar avatarUrl={m.avatarUrl} name={m.name || m.email} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.name || m.email}
                  {m.isMe && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                </p>
                {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
              </div>
              {!m.isMe && (
                <button
                  onClick={() => handleRemove(m.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0 px-1"
                  title="Remove from team"
                >
                  ✕
                </button>
              )}
            </div>
            {/* Bottom row: selects — indented to align under name */}
            <div className="flex gap-2 mt-2 pl-10">
              {positions.length > 0 && (
                <select
                  value={m.position ?? ''}
                  onChange={(e) => handlePositionChange(m.id, e.target.value)}
                  className="flex-1 min-w-0 text-xs border rounded px-2 py-1 bg-white"
                  title="Position"
                >
                  <option value="">Position…</option>
                  {positions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
              <select
                value={m.role}
                onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
                className={`text-xs border rounded px-2 py-1 bg-white ${positions.length > 0 ? 'w-24 shrink-0' : 'flex-1'}`}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </li>
        ))}
        {members.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-gray-400">No active members.</li>
        )}
      </ul>

      {/* Add player */}
      <div className="px-5 py-4 border-t bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Player</p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="player@example.com"
            required
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as Role)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addPending}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 shrink-0"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {addPending ? '…' : 'Add'}
          </button>
        </form>
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
        {addSuccess && <p className="text-xs text-green-600 mt-2">{addSuccess}</p>}
      </div>
    </div>
  )
}
