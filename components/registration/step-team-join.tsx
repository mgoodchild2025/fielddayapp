'use client'

import { useState, useEffect } from 'react'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'

export interface TeamOption {
  id: string
  name: string
  memberCount: number
  maxSize: number | null
}

interface Props {
  teams: TeamOption[]
  initialTeamCode?: string | null
  onComplete: (teamId?: string) => void
  onBack: () => void
}

export function StepTeamJoin({ initialTeamCode, onComplete, onBack }: Props) {
  const [teamCode, setTeamCode] = useState(initialTeamCode ?? '')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeValid, setCodeValid] = useState<{ id: string; name: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [joining, setJoining] = useState(false)

  // Auto-validate when a code arrives pre-filled from the invite link
  useEffect(() => {
    const code = (initialTeamCode ?? '').trim().toUpperCase()
    if (!code) return
    setValidating(true)
    validateTeamCode(code).then((result) => {
      setValidating(false)
      if (result.error) {
        setCodeError(result.error)
      } else {
        setCodeValid(result.data)
      }
    })
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Checked as soon as the code is complete (and on blur). The Join button is
  // always there: it used to appear only after the field lost focus, so with
  // the keyboard up there was no visible next step.
  async function checkCode(raw: string): Promise<{ id: string; name: string } | null> {
    const code = raw.trim().toUpperCase()
    if (!code) { setCodeValid(null); setCodeError(null); return null }
    setValidating(true)
    setCodeError(null)
    const result = await validateTeamCode(code)
    setValidating(false)
    if (result.error || !result.data) {
      setCodeValid(null)
      setCodeError(result.error ?? 'Team code not found')
      return null
    }
    setCodeValid(result.data)
    return result.data
  }

  async function handleJoinByCode() {
    const team = codeValid ?? await checkCode(teamCode)
    if (!team) {
      if (!teamCode.trim()) setCodeError('Enter the code your captain shared.')
      return
    }
    setJoining(true)
    const result = await joinTeamByCode(teamCode.trim().toUpperCase())
    if (result?.error) {
      setJoining(false)
      setCodeError(result.error)
      return
    }
    onComplete(team.id)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">Join your team</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Enter the 6-character code your captain shared with you.
          </p>
        </div>
        <div>
          <label htmlFor="join_team_code" className="block text-sm font-medium text-gray-700 mb-1">Team code</label>
          <input
            id="join_team_code"
            type="text"
            value={teamCode}
            onChange={(e) => {
              const next = e.target.value.toUpperCase()
              setTeamCode(next)
              setCodeValid(null)
              setCodeError(null)
              if (next.trim().length === 6) checkCode(next)
            }}
            onBlur={() => { if (teamCode.trim() && !codeValid && !validating) checkCode(teamCode) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleJoinByCode() } }}
            placeholder="e.g. AB3X7K"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? 'join_team_code-error' : undefined}
            className="w-full border rounded-md px-3 py-2 text-base font-mono tracking-widest uppercase"
          />
          {validating && <p className="text-xs text-gray-500 mt-1">Checking…</p>}
          {codeError && <p id="join_team_code-error" role="alert" className="text-red-600 text-xs mt-1">{codeError}</p>}
          {codeValid && (
            <p className="text-green-700 text-xs mt-1">✓ Team: <strong>{codeValid.name}</strong></p>
          )}
        </div>
        <button
          type="button"
          onClick={handleJoinByCode}
          disabled={joining || validating}
          className="press w-full min-h-11 rounded-md font-semibold bg-brand-primary text-on-brand disabled:opacity-60 text-sm"
        >
          {joining ? 'Joining…' : codeValid ? `Join ${codeValid.name} →` : 'Join team →'}
        </button>
      </div>

      <div className="bg-white rounded-lg border p-5 text-center space-y-2">
        <p className="text-sm text-gray-500">Don&apos;t have a code? You can join a team later from the event page.</p>
        <button
          type="button"
          onClick={() => onComplete()}
          className="press inline-flex items-center min-h-10 text-sm font-medium underline text-brand-primary"
        >
          Skip — I&apos;ll join a team later →
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="press inline-flex items-center min-h-10 text-sm text-gray-500 hover:text-gray-700"
      >
        ← Back
      </button>
    </div>
  )
}
