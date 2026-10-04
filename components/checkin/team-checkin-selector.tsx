'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TeamCheckinModal } from '@/components/checkin/team-checkin-modal'

interface Team {
  id: string
  name: string
}

interface Props {
  teams: Team[]
  leagueId: string
  timezone: string
}

export function TeamCheckinSelector({ teams, leagueId, timezone }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const router = useRouter()

  if (teams.length === 0) return null

  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-3">Check In by Team</h2>
        {/* Phones: one select — a button per team pushed the roster off-screen. */}
        <select
          aria-label="Check in a team"
          value=""
          onChange={(e) => { if (e.target.value) setSelectedTeamId(e.target.value) }}
          className="sm:hidden w-full min-h-11 border rounded-lg px-3 text-sm font-medium bg-white"
        >
          <option value="">Choose a team…</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <div className="hidden sm:flex flex-wrap gap-2">
          {teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelectedTeamId(team.id)}
              className="press min-h-10 px-4 rounded-lg border text-sm font-medium bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      <TeamCheckinModal
        teamId={selectedTeamId}
        leagueId={leagueId}
        timezone={timezone}
        // The roster and counter under the sheet were stale after team check-ins.
        onClose={() => { setSelectedTeamId(null); router.refresh() }}
      />
    </>
  )
}
