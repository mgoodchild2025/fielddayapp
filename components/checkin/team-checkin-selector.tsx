'use client'

import { useState } from 'react'
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

  if (teams.length === 0) return null

  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-3">Check In by Team</h2>
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelectedTeamId(team.id)}
              className="px-4 py-2 rounded-lg border text-sm font-medium bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      {selectedTeamId && (
        <TeamCheckinModal
          teamId={selectedTeamId}
          leagueId={leagueId}
          timezone={timezone}
          onClose={() => setSelectedTeamId(null)}
        />
      )}
    </>
  )
}
