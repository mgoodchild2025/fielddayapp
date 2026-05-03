'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'

export function JoinTeamByCode() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [teamCode, setTeamCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeValid, setCodeValid] = useState<{ id: string; name: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinedName, setJoinedName] = useState<string | null>(null)

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

  async function handleJoin() {
    if (!codeValid) return
    setJoining(true)
    const result = await joinTeamByCode(teamCode.trim().toUpperCase())
    setJoining(false)
    if (result?.error) {
      setCodeError(result.error)
      return
    }
    const name = codeValid.name
    setJoinedName(name)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    router.refresh()
    // Collapse back to button after showing success so the page shrinks
    setTimeout(() => {
      setJoinedName(null)
      setOpen(false)
      setTeamCode('')
      setCodeValid(null)
    }, 2500)
  }

  if (joinedName) {
    return (
      <div className="mt-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
        ✓ You&apos;ve joined {joinedName}!
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full py-3 rounded-lg border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
      >
        + Join a team with a code
      </button>
    )
  }

  return (
    <div className="mt-3 bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Enter your team code</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setTeamCode(''); setCodeValid(null); setCodeError(null) }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
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
        autoFocus
      />
      {validating && <p className="text-xs text-gray-400">Checking…</p>}
      {codeError && <p className="text-xs text-red-500">{codeError}</p>}
      {codeValid && <p className="text-xs text-green-600">✓ Team: <strong>{codeValid.name}</strong></p>}
      {codeValid && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={joining}
          className="w-full py-2.5 rounded-md font-semibold text-white text-sm disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {joining ? 'Joining…' : `Join ${codeValid.name} →`}
        </button>
      )}
    </div>
  )
}
