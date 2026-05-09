'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'

export function JoinTeamByCode() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [teamCode, setTeamCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [joinedName, setJoinedName] = useState<string | null>(null)

  // If the URL contains ?code=XXXXXX (from a captain's invite link),
  // pre-fill and auto-submit so the player joins in one click.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const codeParam = params.get('code')?.trim().toUpperCase()
    if (!codeParam) return
    setTeamCode(codeParam)
    setOpen(true)
    // Small delay so the UI renders the open form before auto-submitting
    const t = setTimeout(() => handleSubmitCode(codeParam), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmitCode(code: string) {
    setLoading(true)
    setError(null)

    const validation = await validateTeamCode(code)
    if (validation.error || !validation.data) {
      setError(validation.error ?? 'Invalid code')
      setLoading(false)
      return
    }

    const result = await joinTeamByCode(code)
    setLoading(false)
    if (result?.error) {
      setError(result.error)
      return
    }

    setJoinedName(validation.data.name)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    router.refresh()
    setTimeout(() => {
      setJoinedName(null)
      setOpen(false)
      setTeamCode('')
    }, 2500)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const code = teamCode.trim().toUpperCase()
    if (!code) return
    handleSubmitCode(code)
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
    <form onSubmit={handleSubmit} className="mt-3 bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Enter your team code</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setTeamCode(''); setError(null) }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
      <input
        type="text"
        value={teamCode}
        onChange={(e) => { setTeamCode(e.target.value.toUpperCase()); setError(null) }}
        placeholder="e.g. AB3X7K"
        maxLength={6}
        className="w-full border rounded-md px-3 py-2 text-base font-mono tracking-widest uppercase"
        autoFocus
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {loading && (
        <p className="text-xs text-gray-400">Joining team…</p>
      )}
      <button
        type="submit"
        disabled={loading || !teamCode.trim()}
        className="w-full py-2.5 rounded-md font-semibold text-white text-sm disabled:opacity-50"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Joining…' : 'Join Team →'}
      </button>
    </form>
  )
}
