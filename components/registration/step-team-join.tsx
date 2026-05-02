'use client'

import { useState } from 'react'
import { validateTeamCode, joinTeamByCode, requestToJoinTeam } from '@/actions/teams'

export interface TeamOption {
  id: string
  name: string
  memberCount: number
  maxSize: number | null
}

interface Props {
  teams: TeamOption[]
  onComplete: () => void
  onBack: () => void
}

type Panel = 'code' | 'browse'

export function StepTeamJoin({ teams, onComplete, onBack }: Props) {
  const [panel, setPanel] = useState<Panel>('code')

  // Team code state
  const [teamCode, setTeamCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeValid, setCodeValid] = useState<{ id: string; name: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [joining, setJoining] = useState(false)

  // Browse state
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({})

  async function handleCodeBlur() {
    const code = teamCode.trim().toUpperCase()
    if (!code) { setCodeValid(null); setCodeError(null); return }
    setValidating(true)
    setCodeError(null)
    const result = await validateTeamCode(code)
    setValidating(false)
    if (result.error) {
      setCodeValid(null)
      setCodeError(result.error)
    } else {
      setCodeValid(result.data)
    }
  }

  async function handleJoinByCode() {
    if (!codeValid) return
    setJoining(true)
    const result = await joinTeamByCode(teamCode.trim().toUpperCase())
    setJoining(false)
    if (result?.error) {
      setCodeError(result.error)
      return
    }
    onComplete()
  }

  async function handleRequestJoin(teamId: string) {
    setRequestingId(teamId)
    const result = await requestToJoinTeam(teamId)
    setRequestingId(null)
    if (result.error) {
      setRequestErrors((prev) => ({ ...prev, [teamId]: result.error! }))
      return
    }
    setRequestedIds((prev) => new Set([...prev, teamId]))
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setPanel('code')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              panel === 'code' ? 'text-white' : 'text-gray-500 hover:text-gray-700 bg-white'
            }`}
            style={panel === 'code' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            I have a team code
          </button>
          <button
            type="button"
            onClick={() => setPanel('browse')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              panel === 'browse' ? 'text-white' : 'text-gray-500 hover:text-gray-700 bg-white'
            }`}
            style={panel === 'browse' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            Browse teams
          </button>
        </div>

        {/* Team code panel */}
        {panel === 'code' && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500">
              Enter the 6-character code your captain shared with you to join their team automatically.
            </p>
            <div>
              <input
                type="text"
                value={teamCode}
                onChange={(e) => {
                  setTeamCode(e.target.value.toUpperCase())
                  setCodeValid(null)
                  setCodeError(null)
                }}
                onBlur={handleCodeBlur}
                placeholder="e.g. AB3X7K"
                maxLength={6}
                className="w-full border rounded-md px-3 py-2 text-sm font-mono tracking-widest uppercase"
              />
              {validating && <p className="text-xs text-gray-400 mt-1">Checking…</p>}
              {codeError && <p className="text-red-500 text-xs mt-1">{codeError}</p>}
              {codeValid && (
                <p className="text-green-600 text-xs mt-1">✓ Team: <strong>{codeValid.name}</strong></p>
              )}
            </div>
            {codeValid && (
              <button
                type="button"
                onClick={handleJoinByCode}
                disabled={joining}
                className="w-full py-2.5 rounded-md font-semibold text-white disabled:opacity-60 text-sm"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {joining ? 'Joining…' : `Join ${codeValid.name} →`}
              </button>
            )}
          </div>
        )}

        {/* Browse teams panel */}
        {panel === 'browse' && (
          <div className="divide-y">
            {teams.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No teams have registered yet.</p>
            ) : (
              teams.map((team) => {
                const isFull = team.maxSize !== null && team.memberCount >= team.maxSize
                const requested = requestedIds.has(team.id)
                const reqError = requestErrors[team.id]
                return (
                  <div key={team.id} className="px-5 py-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{team.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {team.maxSize
                          ? `${team.memberCount} / ${team.maxSize} players`
                          : `${team.memberCount} player${team.memberCount !== 1 ? 's' : ''}`}
                        {isFull && <span className="ml-2 text-red-500 font-medium">· Full</span>}
                      </p>
                      {reqError && <p className="text-xs text-red-500 mt-0.5">{reqError}</p>}
                    </div>
                    <div className="shrink-0">
                      {requested ? (
                        <span className="text-xs text-green-600 font-medium">✓ Requested</span>
                      ) : isFull ? (
                        <span className="text-xs text-gray-400">Full</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestJoin(team.id)}
                          disabled={requestingId === team.id}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-60"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          {requestingId === team.id ? 'Sending…' : 'Request to join'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Skip / continue */}
      <div className="bg-white rounded-lg border p-5 text-center space-y-2">
        <p className="text-sm text-gray-500">
          {requestedIds.size > 0
            ? `You've sent ${requestedIds.size} join request${requestedIds.size > 1 ? 's' : ''}. The captain will be notified.`
            : "Don't have a team yet? You can join one later from the event page."}
        </p>
        <button
          type="button"
          onClick={onComplete}
          className="text-sm font-medium underline"
          style={{ color: 'var(--brand-primary)' }}
        >
          {requestedIds.size > 0 ? 'Done →' : 'Skip — I\'ll find a team later →'}
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ← Back
      </button>
    </div>
  )
}
