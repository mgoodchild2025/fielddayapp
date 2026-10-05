'use client'

import { undoableRemove, insertAt } from '@/components/ui/use-undoable-remove'

import { useState, useTransition } from 'react'
import { inviteGameSub, removeGameSub } from '@/actions/game-subs'
import type { GameSub } from '@/actions/game-subs'
import { safeAction } from '@/lib/action-errors'

interface Props {
  gameId: string
  teamId: string
  /** Pre-fetched list of current game subs for this team */
  initialSubs: GameSub[]
}

export function InviteSubButton({ gameId, teamId, initialSubs }: Props) {
  const [open, setOpen]         = useState(false)
  const [email, setEmail]       = useState('')
  const [message, setMessage]   = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [subs, setSubs]         = useState<GameSub[]>(initialSubs)
  const [isPending, startTransition] = useTransition()

  function handleOpen() {
    setOpen(true)
    setError(null)
    setSuccess(null)
    setEmail('')
    setMessage('')
  }

  function handleCancel() {
    setOpen(false)
    setError(null)
    setSuccess(null)
  }

  function handleSubmit() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) { setError('Enter an email address'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Enter a valid email address'); return }
    setError(null)

    startTransition(async () => {
      const result = await safeAction(inviteGameSub(gameId, teamId, trimmedEmail, message.trim() || undefined))
      if (result.error) {
        setError(result.error)
        return
      }
      // Show the new sub straight away (it only appeared after a reload, so
      // the captain couldn't see or remove who they'd just invited).
      if (result.subId) {
        const now = new Date()
        setSubs((prev) => [...prev, {
          id: result.subId!, gameId, teamId, userId: null, invitedEmail: trimmedEmail, status: 'invited',
          inviterName: null, message: message.trim() || null,
          expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(), createdAt: now.toISOString(),
        }])
      }
      setSuccess(`Invite sent to ${trimmedEmail}`)
      setEmail('')
      setMessage('')
      setOpen(false)
    })
  }

  // Recoverable: the row goes at once with Undo; the delete runs when the
  // toast closes, and a failed delete brings the row back with the error
  // (it used to vanish even when the server refused).
  function handleRemove(subId: string) {
    const idx = subs.findIndex((s) => s.id === subId)
    const sub = subs[idx]
    if (!sub) return
    setSubs((prev) => prev.filter((s) => s.id !== subId))
    undoableRemove({
      label: `Removed ${sub.invitedEmail}`,
      restore: () => setSubs((prev) => insertAt(prev, idx, sub)),
      commit: () => removeGameSub(subId),
    })
  }

  return (
    <div className="pt-2.5 mt-0.5 border-t border-gray-100 space-y-2">
      {/* Current subs list */}
      {subs.length > 0 && (
        <ul className="space-y-1">
          {subs.map((sub) => (
            <li key={sub.id} className="flex items-center gap-2 text-sm">
              <span className={`shrink-0 font-bold w-3 text-center ${
                sub.status === 'confirmed' ? 'text-green-500' : 'text-gray-300'
              }`}>
                {sub.status === 'confirmed' ? '✓' : '?'}
              </span>
              <span className="flex-1 truncate text-gray-600">{sub.invitedEmail}</span>
              <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                sub.status === 'confirmed'
                  ? 'bg-green-50 text-green-600 border border-green-100'
                  : 'bg-gray-50 text-gray-500 border border-gray-100'
              }`}>
                {sub.status === 'confirmed' ? 'Confirmed' : 'Invited'}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(sub.id)}
                disabled={isPending}
                className="press shrink-0 inline-flex items-center justify-center min-h-10 min-w-10 -my-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 text-sm leading-none"
                aria-label={`Remove ${sub.invitedEmail}`}
                title="Remove sub"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Success message */}
      {success && (
        <p className="fd-fade-in text-[11px] text-green-600 font-medium">{success}</p>
      )}

      {/* Invite form or button */}
      {open ? (
        <div className="space-y-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Sub's email address"
            aria-label="Sub's email address"
            autoComplete="email"
            autoCapitalize="none"
            enterKeyHint="send"
            autoFocus
            className="w-full min-h-11 border rounded px-3 text-base focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] bg-white"
          />
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Note to sub (optional)"
            aria-label="Note to sub (optional)"
            className="w-full min-h-11 border rounded px-3 text-base focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] bg-white"
          />
          {error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="press flex-1 min-h-10 rounded text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-50"
            >
              {isPending ? 'Sending…' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="press min-h-10 px-3 rounded text-sm font-medium text-gray-700 border border-gray-200 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="press inline-flex items-center gap-1 min-h-10 text-sm font-semibold text-gray-700 hover:text-gray-900 select-none"
        >
          <span className="text-base leading-none">+</span> Invite Sub
        </button>
      )}
    </div>
  )
}
