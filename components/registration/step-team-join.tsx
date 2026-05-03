'use client'

import { useState } from 'react'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'

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

export function StepTeamJoin({ onComplete, onBack }: Props) {
  const [teamCode, setTeamCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeValid, setCodeValid] = useState<{ id: string; name: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [joining, setJoining] = useState(false)

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
            className="w-full border rounded-md px-3 py-2 text-base font-mono tracking-widest uppercase"
            autoFocus
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

      <div className="bg-white rounded-lg border p-5 text-center space-y-2">
        <p className="text-sm text-gray-500">Don&apos;t have a code? You can join a team later from the event page.</p>
        <button
          type="button"
          onClick={onComplete}
          className="text-sm font-medium underline"
          style={{ color: 'var(--brand-primary)' }}
        >
          Skip — I&apos;ll join a team later →
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
