'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { invitePlayerToPickup, revokePickupInvite } from '@/actions/invites'

interface Invite {
  id: string
  email: string
  status: string
  invited_at: string
}

interface Props {
  leagueId: string
  initialInvites: Invite[]
}

export function PickupInvitesManager({ leagueId, initialInvites }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await invitePlayerToPickup(leagueId, email)
      if (result.error) {
        setFormError(result.error)
      } else {
        setEmail('')
        router.refresh()
      }
    })
  }

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      await revokePickupInvite(inviteId, leagueId)
      setConfirmRevokeId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-sm mb-3">Invite a Player</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
            required
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
          <button
            type="submit"
            disabled={isPending || !email}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
        {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
        <p className="text-xs text-gray-400 mt-2">
          An email will be sent with a link to this event. The player must log in or create an account with this email address to register.
        </p>
      </div>

      {/* Invites list */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {initialInvites.length === 0 ? 'No invites sent yet' : `${initialInvites.length} invite${initialInvites.length !== 1 ? 's' : ''}`}
        </p>

        {initialInvites.length > 0 && (
          <div className="bg-white border rounded-lg divide-y">
            {initialInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{invite.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Invited {new Date(invite.invited_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    invite.status === 'accepted'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {invite.status === 'accepted' ? 'Registered' : 'Pending'}
                  </span>

                  {confirmRevokeId === invite.id ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Revoke?</span>
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        disabled={isPending}
                        className="text-red-600 font-medium hover:underline disabled:opacity-40"
                      >
                        {isPending ? 'Revoking…' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmRevokeId(null)}
                        className="text-gray-500 hover:underline"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRevokeId(invite.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
