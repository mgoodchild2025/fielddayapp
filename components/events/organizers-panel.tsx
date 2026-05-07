'use client'

import { useState, useTransition } from 'react'
import {
  inviteCoOrganizer,
  addOrgAdminAsOrganizer,
  removeCoOrganizer,
  resendOrganizerInvite,
  type OrganizerRow,
  type AvailableAdmin,
} from '@/actions/organizers'

function StatusBadge({ row }: { row: OrganizerRow }) {
  if (row.is_org_admin) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
        Org Admin
      </span>
    )
  }
  if (row.status === 'pending') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">Pending</span>
  }
  if (row.status === 'declined') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-500">Declined</span>
  }
  return null
}

export function OrganizersPanel({
  leagueId,
  organizers: initialOrganizers,
  availableAdmins: initialAvailableAdmins,
  isOrgAdmin,
}: {
  leagueId: string
  organizers: OrganizerRow[]
  availableAdmins: AvailableAdmin[]
  isOrgAdmin: boolean
}) {
  const [organizers, setOrganizers] = useState<OrganizerRow[]>(initialOrganizers)
  const [availableAdmins, setAvailableAdmins] = useState<AvailableAdmin[]>(initialAvailableAdmins)
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [addAdminError, setAddAdminError] = useState<string | null>(null)
  const [addAdminPending, startAddAdmin] = useTransition()
  const [invitePending, startInvite] = useTransition()
  const [actionPending, startAction] = useTransition()

  const activeOrganizers = organizers.filter(o => o.status === 'active' || o.status === 'pending')
  const activeCount = organizers.filter(o => o.status === 'active').length

  function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAdminId) return
    setAddAdminError(null)
    const admin = availableAdmins.find(a => a.user_id === selectedAdminId)
    startAddAdmin(async () => {
      const result = await addOrgAdminAsOrganizer({ leagueId, userId: selectedAdminId })
      if (result.error) {
        setAddAdminError(result.error)
      } else {
        // Optimistically move admin to the organizers list
        if (admin) {
          setOrganizers(prev => [...prev, {
            id: crypto.randomUUID(),
            invited_email: admin.email ?? '',
            status: 'active',
            user_id: admin.user_id,
            full_name: admin.full_name,
            is_org_admin: true,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          }])
          setAvailableAdmins(prev => prev.filter(a => a.user_id !== selectedAdminId))
        }
        setSelectedAdminId('')
      }
    })
  }

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
        setOrganizers(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            invited_email: inviteEmail.trim().toLowerCase(),
            status: 'pending',
            user_id: null,
            full_name: null,
            is_org_admin: false,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ])
      }
    })
  }

  function handleRemove(organizer: OrganizerRow) {
    if (!confirm(`Remove ${organizer.full_name ?? organizer.invited_email} as an organizer?`)) return
    startAction(async () => {
      const result = await removeCoOrganizer(organizer.id)
      if (!result.error) {
        setOrganizers(prev => prev.filter(o => o.id !== organizer.id))
        // If they were an org admin, add them back to available list
        if (organizer.is_org_admin && organizer.user_id) {
          setAvailableAdmins(prev => [...prev, {
            user_id: organizer.user_id!,
            full_name: organizer.full_name,
            email: organizer.invited_email,
          }])
        }
      }
    })
  }

  function handleResend(organizer: OrganizerRow) {
    startAction(async () => {
      await resendOrganizerInvite(organizer.id)
    })
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Organizers</h2>

      <div className="space-y-1">
        {activeOrganizers.length === 0 && (
          <p className="text-sm text-gray-400 py-2">No organizers assigned yet.</p>
        )}

        {activeOrganizers.map(organizer => (
          <div key={organizer.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {organizer.full_name ?? organizer.invited_email}
              </p>
              {organizer.full_name && (
                <p className="text-xs text-gray-400 truncate">{organizer.invited_email}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <StatusBadge row={organizer} />
              {isOrgAdmin && (
                <div className="flex items-center gap-1">
                  {organizer.status === 'pending' && (
                    <button
                      onClick={() => handleResend(organizer)}
                      disabled={actionPending}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 px-1"
                    >
                      Resend
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(organizer)}
                    disabled={actionPending || (organizer.status === 'active' && activeCount <= 1)}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-30 px-1"
                    title={organizer.status === 'active' && activeCount <= 1 ? 'Cannot remove the only organizer' : 'Remove organizer'}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add section — org admins only */}
      {isOrgAdmin && (
        <div className="border-t pt-4 mt-3 space-y-4">
          {/* Add existing org admin directly */}
          {availableAdmins.length > 0 && (
            <form onSubmit={handleAddAdmin}>
              <p className="text-xs font-medium text-gray-500 mb-2">Add Org Admin</p>
              <div className="flex gap-2">
                <select
                  value={selectedAdminId}
                  onChange={e => { setSelectedAdminId(e.target.value); setAddAdminError(null) }}
                  className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 bg-white"
                >
                  <option value="">Select an admin…</option>
                  {availableAdmins.map(admin => (
                    <option key={admin.user_id} value={admin.user_id}>
                      {admin.full_name ?? admin.email ?? admin.user_id}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={addAdminPending || !selectedAdminId}
                  className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {addAdminPending ? 'Adding…' : 'Add'}
                </button>
              </div>
              {addAdminError && <p className="text-xs text-red-600 mt-1.5">{addAdminError}</p>}
            </form>
          )}

          {/* Invite external co-organizer by email */}
          <form onSubmit={handleInvite}>
            <p className="text-xs font-medium text-gray-500 mb-2">Invite Co-Organizer by Email</p>
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
            {inviteError && <p className="text-xs text-red-600 mt-1.5">{inviteError}</p>}
            {inviteSuccess && <p className="text-xs text-green-600 mt-1.5">Invitation sent!</p>}
          </form>
        </div>
      )}
    </div>
  )
}
