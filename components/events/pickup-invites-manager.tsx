'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { invitePlayerToPickup, revokePickupInvite } from '@/actions/invites'

interface Invite {
  id: string
  email: string
  status: string
  invite_type: string
  invited_at: string
}

interface Props {
  leagueId: string
  isPrivate: boolean
  hasDropIn: boolean
  initialInvites: Invite[]
}

const INPUT =
  'flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]'
const BTN =
  'px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50'

function InviteSection({
  title,
  description,
  leagueId,
  inviteType,
  invites,
}: {
  title: string
  description: string
  leagueId: string
  inviteType: 'season' | 'drop_in'
  invites: Invite[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await invitePlayerToPickup(leagueId, email, inviteType)
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
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className="text-xs text-gray-400 mb-3">{description}</p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
            required
            className={INPUT}
          />
          <button
            type="submit"
            disabled={isPending || !email}
            className={BTN}
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
        {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
      </div>

      {invites.length > 0 && (
        <div className="bg-white border rounded-lg divide-y">
          {invites.map((invite) => (
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
                  {invite.status === 'accepted' ? 'Used' : 'Pending'}
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

      {invites.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No {inviteType === 'drop_in' ? 'drop-in' : 'season'} invites sent yet.</p>
      )}
    </div>
  )
}

export function PickupInvitesManager({ leagueId, isPrivate, hasDropIn, initialInvites }: Props) {
  const seasonInvites = initialInvites.filter((i) => i.invite_type === 'season')
  const dropInInvites = initialInvites.filter((i) => i.invite_type === 'drop_in')

  if (!isPrivate && !hasDropIn) {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-gray-500 text-sm">
        No invite options available for this event.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {hasDropIn && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Drop-in Invites</h2>
          <InviteSection
            title="Invite a Drop-in Player"
            description="Send a one-time drop-in invite when a regular player can't make it. The player pays the drop-in fee when they register."
            leagueId={leagueId}
            inviteType="drop_in"
            invites={dropInInvites}
          />
        </div>
      )}

      {isPrivate && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Season Invites</h2>
          <InviteSection
            title="Invite a Season Player"
            description="Invite a player to register for the full season. Required since this is a private event."
            leagueId={leagueId}
            inviteType="season"
            invites={seasonInvites}
          />
        </div>
      )}
    </div>
  )
}
