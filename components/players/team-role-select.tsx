'use client'

import { useTransition } from 'react'
import { setTeamMemberRole } from '@/actions/players'

interface Props {
  teamMemberId: string
  currentRole: string
  userId: string
}

export function TeamRoleSelect({ teamMemberId, currentRole, userId }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as 'captain' | 'player' | 'sub'
    startTransition(async () => { await setTeamMemberRole(teamMemberId, role, userId) })
  }

  return (
    <select
      defaultValue={currentRole}
      onChange={handleChange}
      disabled={isPending}
      className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:opacity-50"
    >
      <option value="player">Player</option>
      <option value="captain">Captain</option>
      <option value="sub">Sub</option>
    </select>
  )
}
