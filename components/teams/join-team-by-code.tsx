'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'
import Link from 'next/link'

export function JoinTeamByCode() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [teamCode, setTeamCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null)

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

    // Stay put with a lasting confirmation + a way to the team. (It used to
    // scroll to the top — away from the message — which then vanished after
    // 2.5s, so a phone user never saw that it worked.)
    setJoined({ id: validation.data.id, name: validation.data.name })
    router.refresh()
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const code = teamCode.trim().toUpperCase()
    if (!code) return
    handleSubmitCode(code)
  }

  if (joined) {
    return (
      <div role="status" className="fd-result-in mt-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-green-800 font-medium">✓ You&apos;ve joined {joined.name}!</p>
        <Link href={`/teams/${joined.id}`} className="press inline-flex items-center min-h-10 px-4 rounded-lg text-sm font-semibold bg-brand-primary text-on-brand">
          View team →
        </Link>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press mt-3 w-full min-h-12 rounded-lg border-2 border-dashed border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-800"
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
          className="press min-h-10 -my-2 px-2 text-sm text-gray-600 hover:text-gray-800"
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
        aria-label="Team code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        className="w-full min-h-11 border rounded-md px-3 text-base font-mono tracking-widest uppercase"
        autoFocus
      />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {loading && (
        <p className="text-xs text-gray-500">Joining team…</p>
      )}
      <button
        type="submit"
        disabled={loading || !teamCode.trim()}
        className="press w-full min-h-11 rounded-md font-semibold text-sm bg-brand-primary text-on-brand disabled:opacity-50"
      >
        {loading ? 'Joining…' : 'Join Team →'}
      </button>
    </form>
  )
}
