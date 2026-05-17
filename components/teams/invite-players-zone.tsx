'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { captainAddPlayerByEmail, regenerateTeamCode } from '@/actions/teams'

type Role = 'captain' | 'coach' | 'player' | 'sub'

const ROLES: { value: Role; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'sub', label: 'Sub' },
]

interface Props {
  teamId: string
  teamCode: string | null
}

export function InvitePlayersZone({ teamId, teamCode: initialCode }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const inviteUrl = code && origin ? `${origin}/join/${code}` : null

  // Copy link
  const [copied, setCopied] = useState(false)
  function copyLink() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Regenerate code
  const [regenerating, setRegenerating] = useState(false)
  async function handleRegenerate() {
    if (!confirm('Generate a new code? The old link will stop working immediately.')) return
    setRegenerating(true)
    const result = await regenerateTeamCode(teamId)
    setRegenerating(false)
    if (result.data) setCode(result.data.team_code)
  }

  // Email invite form
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('player')
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    const emailToSend = email
    const roleToSend = role
    startTransition(async () => {
      const result = await captainAddPlayerByEmail({ teamId, email: emailToSend, role: roleToSend })
      if (result.error) {
        setFormError(result.error)
      } else {
        setFormSuccess(`Invite sent to ${emailToSend}`)
        setEmail('')
        setRole('player')
        setShowForm(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="px-4 py-4 border-b">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Invite Players</p>

      {/* Join link */}
      {inviteUrl && (
        <div className="flex items-center gap-2 mb-2">
          <code className="flex-1 min-w-0 text-xs text-gray-500 bg-gray-50 border rounded-md px-2.5 py-2 truncate font-mono">
            {inviteUrl}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 px-3 py-2 rounded-md text-xs font-semibold border transition-colors"
            style={copied
              ? { borderColor: '#10b981', color: '#059669', backgroundColor: '#f0fdf4' }
              : { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }
            }
          >
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
      )}

      {/* Code + regenerate */}
      {code && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">Code:</span>
          <span className="font-mono font-bold text-sm tracking-widest bg-gray-100 px-2 py-0.5 rounded">
            {code}
          </span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate code"
            className="text-xs text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {regenerating ? '…' : '↺ Regenerate'}
          </button>
        </div>
      )}

      {/* Email invite toggle / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormSuccess(null) }}
          className="text-xs font-medium transition-colors"
          style={{ color: 'var(--brand-primary)' }}
        >
          + Email an invite
        </button>
      ) : (
        <form onSubmit={handleSend} className="mt-1 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="player@example.com"
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {pending ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="px-4 py-2 rounded-md text-sm text-gray-600 border hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </form>
      )}

      {formSuccess && <p className="text-xs text-green-600 mt-1.5">{formSuccess}</p>}
    </div>
  )
}
