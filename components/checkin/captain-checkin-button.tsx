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
        className="press inline-flex items-center gap-1.5 min-h-11 max-w-full px-4 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-300"
      >
        {/* Clipboard icon */}
        <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="truncate">Check In {teamName ? `${teamName}` : 'Team'}</span>
      </button>

      <TeamCheckinModal
        teamId={open ? teamId : null}
        leagueId={leagueId}
        timezone={timezone}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
