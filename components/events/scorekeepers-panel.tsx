'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { inviteScorekeeper, removeScorekeeper, type ScorekeeperRow } from '@/actions/scorekeepers'
import { undoableRemove } from '@/components/ui/use-undoable-remove'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'

/**
 * Scorekeepers: volunteers who enter this event's scores (game sheets,
 * scoreboard, playoff matches) from their own Scorekeeping page, with no other
 * admin access. Invited by email; "Copy link" lets an organiser text the
 * invite on game day.
 */
export function ScorekeepersPanel({ leagueId, initialRows }: { leagueId: string; initialRows: ScorekeeperRow[] }) {
  const [rows, setRows] = useState<ScorekeeperRow[]>(initialRows)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function invite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const address = email.trim().toLowerCase()
    start(async () => {
      const res = await safeAction(inviteScorekeeper({ leagueId, email: address }))
      if (res.error) {
        setError(res.error)
        return
      }
      toast.success(`Invite sent to ${address}`)
      setEmail('')
      setRows((prev) => [
        ...prev.filter((r) => r.email !== address),
        { id: res.id ?? `new-${address}`, email: address, name: null, status: 'pending', expired: false, inviteUrl: res.inviteUrl ?? null },
      ])
    })
  }

  async function copy(row: ScorekeeperRow) {
    if (!row.inviteUrl) return
    try {
      await navigator.clipboard.writeText(row.inviteUrl)
      setCopiedId(row.id)
      announce('Invite link copied')
      setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 2000)
    } catch {
      toast.error('Couldn’t copy — long-press the link to copy it instead')
    }
  }

  function remove(row: ScorekeeperRow) {
    const index = rows.findIndex((r) => r.id === row.id)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    undoableRemove({
      label: `${row.name ?? row.email} removed`,
      restore: () => setRows((prev) => {
        const next = [...prev]
        next.splice(Math.min(index, next.length), 0, row)
        return next
      }),
      commit: () => safeAction(removeScorekeeper({ leagueId, id: row.id })),
    })
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h2 className="font-semibold text-gray-800">Scorekeepers</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Volunteers who enter this event’s scores — games and playoff matches — from their phone. They can’t see
        registrations, payments or settings, and can’t clear a saved score.
      </p>

      <div className="space-y-1">
        {rows.length === 0 && <p className="text-sm text-gray-500 py-2">No scorekeepers yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="py-2 border-b last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{row.name ?? row.email}</p>
              {row.name && <p className="text-xs text-gray-500 truncate">{row.email}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {row.status === 'pending' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.expired ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>
                  {row.expired ? 'Expired' : 'Invited'}
                </span>
              )}
              {row.status === 'pending' && row.inviteUrl && !row.expired && (
                <button type="button" onClick={() => copy(row)}
                  className="press min-h-10 px-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                  {copiedId === row.id ? <span key="copied" className="fd-fade-in">Copied!</span> : 'Copy link'}
                </button>
              )}
              <button type="button" onClick={() => remove(row)}
                aria-label={`Remove ${row.name ?? row.email}`}
                className="press min-h-10 px-2 text-xs font-medium text-red-600 hover:text-red-700">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={invite} className="border-t pt-4 mt-3">
        <label htmlFor="scorekeeper-email" className="block text-xs font-medium text-gray-500 mb-2">Invite a scorekeeper by email</label>
        <div className="flex gap-2">
          <input
            id="scorekeeper-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            placeholder="volunteer@example.com"
            aria-invalid={!!error}
            aria-describedby={error ? 'scorekeeper-email-error' : undefined}
            className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-white"
            required
          />
          <button type="submit" disabled={pending || !email.trim()}
            className="press px-4 min-h-10 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-50">
            {pending ? 'Sending…' : 'Invite'}
          </button>
        </div>
        {error && <p id="scorekeeper-email-error" role="alert" className="text-xs text-red-600 mt-1.5">{error}</p>}
        <p className="text-xs text-gray-500 mt-2">Expired or lost? Invite the same address again for a fresh link.</p>
      </form>
    </div>
  )
}
