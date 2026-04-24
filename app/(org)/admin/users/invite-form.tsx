'use client'

import { useState, useTransition } from 'react'
import { inviteMember } from '@/actions/members'

export function InviteMemberForm() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; noAccount?: boolean } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setResult(null)

    startTransition(async () => {
      const res = await inviteMember(fd)
      if (res.error) {
        setResult({ error: res.error })
      } else if (res.noAccount) {
        setResult({ noAccount: true })
      } else {
        setResult({})
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="player@example.com"
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 w-64"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Role</label>
        <select
          name="role"
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="player">Player</option>
          <option value="captain">Captain</option>
          <option value="league_admin">League Admin</option>
          <option value="org_admin">Org Admin</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? 'Adding…' : 'Add Member'}
      </button>

      {result?.error && (
        <p className="w-full text-sm text-red-600">{result.error}</p>
      )}
      {result && !result.error && !result.noAccount && (
        <p className="w-full text-sm text-green-600">Member added successfully.</p>
      )}
      {result?.noAccount && (
        <p className="w-full text-sm text-amber-600">
          No account found for that email. Share your org sign-up link so they can register.
        </p>
      )}
    </form>
  )
}
