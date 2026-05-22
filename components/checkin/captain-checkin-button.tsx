'use client'

import { useState } from 'react'
import { TeamCheckinModal } from '@/components/checkin/team-checkin-modal'

interface Props {
  teamId: string
  leagueId: string
  timezone: string
  teamName?: string
}

export function CaptainCheckinButton({ teamId, leagueId, timezone, teamName }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
      >
        {/* Clipboard icon */}
        <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Check In {teamName ? `${teamName}` : 'Team'}
      </button>

      {open && (
        <TeamCheckinModal
          teamId={teamId}
          leagueId={leagueId}
          timezone={timezone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
