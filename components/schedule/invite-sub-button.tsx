'use client'

import { useState, useTransition } from 'react'
import { inviteGameSub, removeGameSub } from '@/actions/game-subs'
import type { GameSub } from '@/actions/game-subs'

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
  const [removingId, setRemovingId] = useState<string | null>(null)
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
      const result = await inviteGameSub(gameId, teamId, trimmedEmail, message.trim() || undefined)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(`Invite sent to ${trimmedEmail}`)
      setEmail('')
      setMessage('')
      setOpen(false)
    })
  }

  function handleRemove(subId: string) {
    if (removingId) return
    setRemovingId(subId)
    startTransition(async () => {
      await removeGameSub(subId)
      setSubs(prev => prev.filter(s => s.id !== subId))
      setRemovingId(null)
    })
  }

  return (
    <div className="pt-2.5 mt-0.5 border-t border-gray-100 space-y-2">
      {/* Current subs list */}
      {subs.length > 0 && (
        <ul className="space-y-1">
          {subs.map((sub) => (
            <li key={sub.id} className="flex items-center gap-2 text-xs">
              <span className={`shrink-0 font-bold w-3 text-center ${
                sub.status === 'confirmed' ? 'text-green-500' : 'text-gray-300'
              }`}>
                {sub.status === 'confirmed' ? '✓' : '?'}
              </span>
              <span className="flex-1 truncate text-gray-600">{sub.invitedEmail}</span>
              <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                sub.status === 'confirmed'
                  ? 'bg-green-50 text-green-600 border border-green-100'
                  : 'bg-gray-50 text-gray-400 border border-gray-100'
              }`}>
                {sub.status === 'confirmed' ? 'Confirmed' : 'Invited'}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(sub.id)}
                disabled={removingId === sub.id || isPending}
                className="shrink-0 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 text-xs leading-none"
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
        <p className="text-[11px] text-green-600 font-medium">{success}</p>
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
            autoFocus
            className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] bg-white"
          />
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Note to sub (optional)"
            className="w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] bg-white"
          />
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Sending…' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 border border-gray-200 hover:bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors select-none"
        >
          <span className="text-[13px] leading-none">+</span> Invite Sub
        </button>
      )}
    </div>
  )
}
