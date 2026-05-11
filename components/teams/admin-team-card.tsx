'use client'

import { useState } from 'react'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { AdminEditTeamForm } from '@/components/teams/admin-edit-team-form'
import { DeleteTeamButton } from '@/components/teams/delete-team-button'
import { TeamCodeBadge } from '@/components/teams/team-code-badge'
import { RosterManager } from '@/components/teams/roster-manager'
import type { ActiveMember, PendingInvite } from '@/components/teams/roster-manager'
import { PendingJoinRequests } from '@/components/teams/pending-join-requests'

interface JoinRequest {
  id: string
  playerName: string
  playerEmail: string
  message: string | null
  createdAt: string
}

interface Props {
  leagueId: string
  leagueSlug: string
  leagueHasWaiver: boolean
  positions: string[]
  isOrgAdmin: boolean
  team: {
    id: string
    name: string
    color: string | null
    logo_url: string | null
    team_code: string | null
  }
  captainName: string | null
  initialMembers: ActiveMember[]
  initialInvites: PendingInvite[]
  joinRequests: JoinRequest[]
}

export function AdminTeamCard({
  leagueId,
  leagueSlug,
  leagueHasWaiver,
  positions,
  isOrgAdmin,
  team,
  captainName,
  initialMembers,
  initialInvites,
  joinRequests,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const playerCount  = initialMembers.length
  const inviteCount  = initialInvites.length
  const joinReqCount = joinRequests.length
  const waiverCount  = leagueHasWaiver
    ? initialMembers.filter((m) => m.waiverStatus === 'signed').length
    : null

  const hasAttention = inviteCount > 0 || joinReqCount > 0

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* ── Collapsed header — always visible ── */}
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <TeamAvatar logoUrl={team.logo_url ?? null} color={team.color} name={team.name} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{team.name}</p>
          {captainName && (
            <p className="text-xs text-gray-400 truncate">Captain: {captainName}</p>
          )}
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
          {/* Players */}
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            {playerCount}
          </span>

          {/* Pending invites */}
          {inviteCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {inviteCount} pending
            </span>
          )}

          {/* Join requests */}
          {joinReqCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              {joinReqCount} request{joinReqCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Waivers */}
          {waiverCount !== null && (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              waiverCount === playerCount && playerCount > 0
                ? 'bg-green-100 text-green-700'
                : waiverCount > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {waiverCount}/{playerCount} waivers
            </span>
          )}

          {/* Edit / Delete — stop propagation so they don't toggle card */}
          {isOrgAdmin && (
            <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
              <AdminEditTeamForm
                team={{ id: team.id, name: team.name, color: team.color, logo_url: team.logo_url ?? null }}
                leagueId={leagueId}
              />
              <DeleteTeamButton teamId={team.id} teamName={team.name} leagueId={leagueId} />
            </div>
          )}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t">
          {/* Team code */}
          {team.team_code && (
            <div className="px-4 py-3 border-b bg-gray-50">
              <TeamCodeBadge teamId={team.id} code={team.team_code} />
            </div>
          )}

          {/* Pending join requests */}
          {joinRequests.length > 0 && (
            <div className="px-4 py-3 border-b">
              <PendingJoinRequests teamId={team.id} initialRequests={joinRequests} />
            </div>
          )}

          {/* Full roster manager */}
          <div className="px-4 py-4">
            <RosterManager
              teamId={team.id}
              leagueId={leagueId}
              leagueSlug={leagueSlug}
              teamCode={team.team_code ?? null}
              leagueHasWaiver={leagueHasWaiver}
              positions={positions}
              initialMembers={initialMembers}
              initialInvites={initialInvites}
            />
          </div>
        </div>
      )}
    </div>
  )
}
