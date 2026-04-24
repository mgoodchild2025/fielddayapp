'use client'

import { useState, useTransition } from 'react'
import { changeMemberRole } from '@/actions/members'

type OrgRole = 'org_admin' | 'league_admin' | 'captain' | 'player'

const roleLabel: Record<OrgRole, string> = {
  org_admin: 'Org Admin',
  league_admin: 'League Admin',
  captain: 'Captain',
  player: 'Player',
}

const roleColors: Record<OrgRole, string> = {
  org_admin: 'bg-purple-100 text-purple-700',
  league_admin: 'bg-blue-100 text-blue-700',
  captain: 'bg-orange-100 text-orange-700',
  player: 'bg-gray-100 text-gray-600',
}

export function ChangeMemberRoleForm({
  memberId,
  currentRole,
}: {
  memberId: string
  currentRole: OrgRole
}) {
  const [role, setRole] = useState<OrgRole>(currentRole)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleChange(newRole: OrgRole) {
    startTransition(async () => {
      await changeMemberRole(memberId, newRole)
      setRole(newRole)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${roleColors[role]}`}
        title="Click to change role"
      >
        {roleLabel[role]}
      </button>
    )
  }

  return (
    <select
      value={role}
      onChange={(e) => handleChange(e.target.value as OrgRole)}
      disabled={isPending}
      autoFocus
      onBlur={() => setEditing(false)}
      className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1"
    >
      <option value="player">Player</option>
      <option value="captain">Captain</option>
      <option value="league_admin">League Admin</option>
      <option value="org_admin">Org Admin</option>
    </select>
  )
}
