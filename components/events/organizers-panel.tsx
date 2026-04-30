'use client'

import { useState, useTransition } from 'react'
import {
  inviteCoOrganizer,
  removeCoOrganizer,
  resendOrganizerInvite,
  type OrganizerRow,
  type OrgAdminRow,
} from '@/actions/organizers'

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  declined: 'bg-red-100 text-red-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

export function OrganizersPanel({
  leagueId,
  orgAdmins,
  coOrganizers: initialCoOrganizers,
  isOrgAdmin,
}: {
  leagueId: string
  orgAdmins: OrgAdminRow[]
  coOrganizers: OrganizerRow[]
  isOrgAdmin: boolean
}) {
  const [coOrganizers, setCoOrganizers] = useState<OrganizerRow[]>(initialCoOrganizers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [invitePending, startInvite] = useTransition()
  const [actionPending, startAction] = useTransition()

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(false)
    startInvite(async () => {
      const result = await inviteCoOrganizer({ leagueId, email: inviteEmail.trim() })
      if (result.error) {
        setInviteError(result.error)
      } else {
        setInviteSuccess(true)
        setInviteEmail('')
        // Optimistically add pending row
        setCoOrganizers(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            invited_email: inviteEmail.trim().toLowerCase(),
            status: 'pending',
            user_id: null,
            full_name: null,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ])
      }
    })
  }

  function handleRemove(organizer: OrganizerRow) {
    if (!confirm(`Remove ${organizer.full_name ?? organizer.invited_email} as a co-organizer?`)) return
    startAction(async () => {
      const result = await removeCoOrganizer(organizer.id)
      if (!result.error) {
        setCoOrganizers(prev => prev.filter(o => o.id !== organizer.id))
      }
    })
  }

  function handleResend(organizer: OrganizerRow) {
    startAction(async () => {
      await resendOrganizerInvite(organizer.id)
    })
  }

  const activeOrPending = coOrganizers.filter(o => o.status === 'active' || o.status === 'pending')

  return (
    <div className="bg-white rounded-lg border p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Organizers</h2>

      {/* Org admins — always shown, cannot be removed */}
      <div className="space-y-2 mb-4">
        {orgAdmins.map(admin => (
          <div key={admin.user_id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{admin.full_name ?? admin.email ?? 'Unknown'}</p>
              {admin.full_name && <p className="text-xs text-gray-400 truncate">{admin.email}</p>}
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
              Org Admin
            </span>
          </div>
        ))}

        {/* Co-organizers */}
        {activeOrPending.map(organizer => (
          <div key={organizer.id} className="flex items-center justify-between gap-3 py-2 border-t">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {organizer.full_name ?? organizer.invited_email}
              </p>
              {organizer.full_name && (
                <p className="text-xs text-gray-400 truncate">{organizer.invited_email}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <StatusBadge status={organizer.status} />
              {isOrgAdmin && (
                <div className="flex items-center gap-1">
                  {organizer.status === 'pending' && (
                    <button
                      onClick={() => handleResend(organizer)}
                      disabled={actionPending}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 px-1"
                      title="Resend invite"
                    >
                      Resend
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(organizer)}
                    disabled={actionPending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 px-1"
                    title="Remove co-organizer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {activeOrPending.length === 0 && (
          <p className="text-sm text-gray-400 border-t pt-3">No co-organizers yet.</p>
        )}
      </div>

      {/* Invite form — org admins only */}
      {isOrgAdmin && (
        <form onSubmit={handleInvite} className="border-t pt-4 mt-2">
          <p className="text-xs font-medium text-gray-500 mb-2">Invite a Co-Organizer</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteError(null); setInviteSuccess(false) }}
              placeholder="Email address"
              required
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
            />
            <button
              type="submit"
              disabled={invitePending || !inviteEmail.trim()}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {invitePending ? 'Sending…' : 'Invite'}
            </button>
          </div>
          {inviteError && (
            <p className="text-xs text-red-600 mt-1.5">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="text-xs text-green-600 mt-1.5">Invitation sent!</p>
          )}
        </form>
      )}
    </div>
  )
}
