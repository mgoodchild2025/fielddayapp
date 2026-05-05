'use client'

import { useRef, useState, useTransition } from 'react'
import { inviteMember } from '@/actions/members'

interface Props {
  orgSlug: string
}

export function InvitePlayerButton({ orgSlug }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ error?: string; noAccount?: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await inviteMember(fd)
      setResult(res)
      if (!res.error) formRef.current?.reset()
    })
  }

  function handleClose() {
    setOpen(false)
    setResult(null)
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null) }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Player
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleClose}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Add Player</h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success — existing account */}
            {result && !result.error && !result.noAccount && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 mb-4">
                ✓ Player added successfully. They will appear in the players list now.
              </div>
            )}

            {/* Success — no account yet */}
            {result?.noAccount && (
              <div className="space-y-3">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  No account found for that email. Share the link below so they can sign up:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`https://${orgSlug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'}/register`}
                    className="flex-1 text-xs border rounded-lg px-3 py-2 bg-gray-50 text-gray-600 font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      `https://${orgSlug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'}/register`
                    )}
                    className="shrink-0 text-xs px-3 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Form — shown when no result yet, or on error */}
            {(!result || result.error) && (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="player@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    defaultValue="player"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  >
                    <option value="player">Player</option>
                    <option value="captain">Captain</option>
                    <option value="league_admin">League Admin</option>
                    <option value="org_admin">Org Admin</option>
                  </select>
                </div>

                {result?.error && (
                  <p className="text-sm text-red-600">{result.error}</p>
                )}

                <p className="text-xs text-gray-400">
                  If they already have an account, they&apos;ll be added immediately.
                  Otherwise you&apos;ll get a signup link to share with them.
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    {isPending ? 'Adding…' : 'Add Player'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
