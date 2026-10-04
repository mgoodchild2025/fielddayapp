'use client'

import { useState, useEffect, useTransition } from 'react'
import { getTeamCheckinStatus, toggleTeamMemberCheckin } from '@/actions/team-checkin'
import type { TeamMemberCheckinStatus } from '@/actions/team-checkin'
import { Overlay, useRetained } from '@/components/ui/overlay'
import { toast } from 'sonner'

interface Props {
  teamId: string
  leagueId: string
  timezone: string
  onClose: () => void
}

/** Team check-in sheet. Open it by setting `teamId`; clear it (null) to close. */
export function TeamCheckinModal({ teamId, ...rest }: Omit<Props, 'teamId'> & { teamId: string | null }) {
  // Keep the roster rendered through the exit after teamId is cleared.
  const shownTeamId = useRetained(teamId)
  return (
    <Overlay
      open={!!teamId}
      onClose={rest.onClose}
      variant="sheet"
      label="Team check-in"
      zIndex={500}
      panelClassName="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]"
    >
      {shownTeamId && <TeamCheckinContent key={shownTeamId} teamId={shownTeamId} {...rest} />}
    </Overlay>
  )
}

function TeamCheckinContent({ teamId, leagueId, timezone, onClose }: Props) {
  const [teamName, setTeamName] = useState<string>('')
  const [members, setMembers] = useState<TeamMemberCheckinStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAllPending, startAllTransition] = useTransition()

  // Load team data on mount
  useEffect(() => {
    getTeamCheckinStatus(teamId, leagueId).then(({ data, error }) => {
      if (error || !data) { setError(error ?? 'Failed to load team'); setLoading(false); return }
      setTeamName(data.teamName)
      setMembers(data.members)
      setLoading(false)
    })
  }, [teamId, leagueId])

  const checkedInCount = members.filter((m) => m.checkedInAt).length
  const uncheckedMembers = members.filter((m) => !m.checkedInAt)

  function handleToggle(registrationId: string, currentlyCheckedIn: boolean) {
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) =>
        m.registrationId === registrationId
          ? { ...m, checkedInAt: currentlyCheckedIn ? null : new Date().toISOString() }
          : m,
      ),
    )
    const name = members.find((m) => m.registrationId === registrationId)?.fullName ?? 'player'
    const revert = () =>
      setMembers((prev) =>
        prev.map((m) =>
          m.registrationId === registrationId
            ? { ...m, checkedInAt: currentlyCheckedIn ? new Date().toISOString() : null }
            : m,
        ),
      )
    toggleTeamMemberCheckin(registrationId, leagueId, !currentlyCheckedIn).then(
      ({ error }) => {
        // Revert AND say so: a silent flip-back on gym wifi looked like a missed tap.
        if (error) { revert(); toast.error(`Couldn't update ${name}: ${error}`) }
      },
      () => { revert(); toast.error(`Couldn't update ${name} — check your connection`) },
    )
  }

  function handleCheckInAll() {
    if (uncheckedMembers.length === 0) return
    // Optimistic update all unchecked members
    const now = new Date().toISOString()
    setMembers((prev) => prev.map((m) => ({ ...m, checkedInAt: m.checkedInAt ?? now })))
    const targets = uncheckedMembers
    startAllTransition(async () => {
      const results = await Promise.all(
        targets.map((m) =>
          toggleTeamMemberCheckin(m.registrationId, leagueId, true).then(
            (r) => ({ m, ok: !r.error }),
            () => ({ m, ok: false }),
          ),
        ),
      )
      // Only the saves that landed stay checked in — never "✓ All Checked In"
      // over a failed write.
      const failed = results.filter((r) => !r.ok).map((r) => r.m)
      if (failed.length > 0) {
        const failedIds = new Set(failed.map((m) => m.registrationId))
        setMembers((prev) => prev.map((m) => (failedIds.has(m.registrationId) ? { ...m, checkedInAt: null } : m)))
        toast.error(`Couldn't check in ${failed.map((m) => m.fullName).join(', ')} — try again`)
      }
    })
  }

  return (
    <>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {loading ? 'Loading…' : teamName}
            </h2>
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">
                {checkedInCount} / {members.length} checked in
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors -mt-0.5 -mr-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Check In All button */}
        {!loading && members.length > 0 && (
          <div className="px-5 py-3 border-b shrink-0">
            <button
              type="button"
              onClick={handleCheckInAll}
              disabled={uncheckedMembers.length === 0 || isAllPending}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={
                uncheckedMembers.length > 0
                  ? { backgroundColor: 'var(--brand-primary)', color: 'var(--brand-on-primary)' }
                  : { backgroundColor: '#f0fdf4', color: '#15803d' }
              }
            >
              {uncheckedMembers.length === 0
                ? '✓ All Checked In'
                : isAllPending
                  ? 'Checking in…'
                  : `Check In All (${uncheckedMembers.length} remaining)`}
            </button>
          </div>
        )}

        {/* Member list */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              Loading roster…
            </div>
          )}

          {error && (
            <div className="px-5 py-6 text-center text-sm text-red-600">{error}</div>
          )}

          {!loading && !error && members.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              No registered players found for this team.
            </div>
          )}

          {!loading && !error && members.map((member) => {
            const checkedIn = !!member.checkedInAt
            return (
              <div
                key={member.registrationId}
                className="flex items-center gap-3 px-5 py-3.5 border-b last:border-0"
              >
                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {member.waiverSigned ? (
                      <span className="text-xs text-green-600 font-medium">✓ Waiver</span>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">⚠ No waiver</span>
                    )}
                    {checkedIn && member.checkedInAt && (
                      <span className="text-xs text-gray-400">
                        · {new Date(member.checkedInAt).toLocaleTimeString('en-CA', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: timezone,
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle button */}
                <button
                  type="button"
                  onClick={() => handleToggle(member.registrationId, checkedIn)}
                  className={`press shrink-0 flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm font-semibold ${
                    checkedIn
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${checkedIn ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {checkedIn ? 'Checked In' : 'Check In'}
                </button>
              </div>
            )
          })}
        </div>
    </>
  )
}
