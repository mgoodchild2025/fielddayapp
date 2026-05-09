'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { captainSetMemberRole, captainRemoveTeamMember, captainAddPlayerByEmail, sendRosterReminder } from '@/actions/teams'
import { resendTeamInvite, cancelTeamInvitation } from '@/actions/invitations'
import { setTeamMemberPosition } from '@/actions/positions'
import { PlayerAvatar } from '@/components/ui/player-avatar'

type Role = 'captain' | 'coach' | 'player' | 'sub'

const ROLES: { value: Role; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'sub', label: 'Sub' },
]

export interface PendingInvite {
  id: string
  invitedEmail: string
  role: string
  invitedAt: string
  expiresAt: string
  inviterName: string | null
}

export interface ActiveMember {
  id: string
  role: string
  position: string | null
  userId: string | null
  isMe: boolean
  name: string
  email: string
  avatarUrl?: string | null
  registrationStatus: 'active' | 'pending' | 'none'
  waiverStatus: 'signed' | 'not_signed' | 'not_required'
}

interface Props {
  teamId: string
  leagueId: string
  leagueSlug: string
  teamCode: string | null
  leagueHasWaiver: boolean
  initialMembers: ActiveMember[]
  initialInvites: PendingInvite[]
  positions?: string[]
}

const REG_BADGE: Record<string, { label: string; className: string }> = {
  active:  { label: 'Registered',  className: 'bg-green-100 text-green-700' },
  pending: { label: 'Pending pay', className: 'bg-amber-100 text-amber-700' },
  none:    { label: 'Not registered', className: 'bg-gray-100 text-gray-500' },
}

const WAIVER_BADGE: Record<string, { label: string; className: string }> = {
  signed:       { label: 'Waiver ✓',  className: 'bg-green-100 text-green-700' },
  not_signed:   { label: 'No waiver', className: 'bg-red-100 text-red-600' },
  not_required: { label: '',          className: '' },
}

export function RosterManager({
  teamId,
  leagueId,
  leagueSlug,
  teamCode,
  leagueHasWaiver,
  initialMembers,
  initialInvites,
  positions = [],
}: Props) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)

  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<Role>('player')
  const [addPending, startAddTransition] = useTransition()
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)

  const [actionPending, startActionTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Reminder modal state
  const [reminderTarget, setReminderTarget] = useState<{ id: string; name: string; type: 'member' | 'invite' } | null>(null)
  const [reminderMsg, setReminderMsg] = useState('')
  const [reminderPending, startReminderTransition] = useTransition()

  function clearFeedback() {
    setActionError(null)
    setActionSuccess(null)
  }

  // ── Active member actions ──────────────────────────────────────────────────

  function handlePositionChange(memberId: string, position: string) {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, position: position || null } : m))
    startActionTransition(async () => {
      await setTeamMemberPosition({ memberId, teamId, position })
    })
  }

  function handleRoleChange(memberId: string, role: Role) {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role } : m))
    startActionTransition(async () => {
      const result = await captainSetMemberRole(memberId, teamId, role)
      if (result.error) setMembers(initialMembers)
    })
  }

  function handleRemoveMember(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    startActionTransition(async () => {
      clearFeedback()
      const result = await captainRemoveTeamMember(memberId, teamId)
      if (result.error) {
        setMembers(initialMembers)
        setActionError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  // ── Invite actions ─────────────────────────────────────────────────────────

  function handleResendInvite(inviteId: string) {
    startActionTransition(async () => {
      clearFeedback()
      const result = await resendTeamInvite(inviteId)
      if (result.error) {
        setActionError(result.error)
      } else {
        setActionSuccess('Invite resent.')
        setTimeout(() => setActionSuccess(null), 3000)
      }
    })
  }

  function handleCancelInvite(inviteId: string, email: string) {
    if (!confirm(`Cancel the invitation to ${email}?`)) return
    setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    startActionTransition(async () => {
      clearFeedback()
      const result = await cancelTeamInvitation(inviteId)
      if (result.error) {
        setActionError(result.error)
        router.refresh()
      }
    })
  }

  // ── Reminder ───────────────────────────────────────────────────────────────

  function openReminder(id: string, name: string, type: 'member' | 'invite') {
    setReminderTarget({ id, name, type })
    setReminderMsg('')
  }

  function handleSendReminder() {
    if (!reminderTarget) return
    if (reminderTarget.type === 'invite') {
      // For pending invites, just resend the invite email
      handleResendInvite(reminderTarget.id)
      setReminderTarget(null)
      return
    }
    startReminderTransition(async () => {
      const result = await sendRosterReminder(teamId, reminderTarget.id, reminderMsg || undefined)
      if (result.error) {
        setActionError(result.error)
      } else {
        setActionSuccess(`Reminder sent to ${reminderTarget.name}.`)
        setTimeout(() => setActionSuccess(null), 3000)
      }
      setReminderTarget(null)
    })
  }

  // ── Add player ─────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddSuccess(null)
    startAddTransition(async () => {
      const result = await captainAddPlayerByEmail({ teamId, email: addEmail, role: addRole })
      if (result.error) {
        setAddError(result.error)
      } else {
        setAddSuccess(`Invite sent to ${addEmail}`)
        setAddEmail('')
        setAddRole('player')
        router.refresh()
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalCount = members.length + invites.length
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const inviteUrl = teamCode && leagueSlug && origin
    ? `${origin}/events/${leagueSlug}?code=${teamCode}`
    : null

  const [copied, setCopied] = useState(false)
  function copyInviteLink() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <div className="mt-6 bg-white rounded-lg border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Manage Roster</h2>
            <span className="text-xs text-gray-400">{totalCount} player{totalCount !== 1 ? 's' : ''}</span>
          </div>
          {inviteUrl && (
            <button
              type="button"
              onClick={copyInviteLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={copied
                ? { borderColor: '#10b981', color: '#059669', backgroundColor: '#f0fdf4' }
                : { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)', backgroundColor: 'transparent' }
              }
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Copy invite link
                </>
              )}
            </button>
          )}
        </div>

        {/* ── Pending invites section ── */}
        {invites.length > 0 && (
          <>
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Pending Invites ({invites.length})
              </p>
            </div>
            <ul className="divide-y">
              {invites.map((inv) => {
                const isExpired = new Date(inv.expiresAt) < new Date()
                return (
                  <li key={inv.id} className="px-4 py-3 flex items-center gap-3">
                    {/* Avatar placeholder — no account yet */}
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-amber-600">?</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{inv.invitedEmail}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                          Invited · {inv.role}
                        </span>
                        {isExpired && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openReminder(inv.id, inv.invitedEmail, 'invite')}
                        disabled={actionPending}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        title={isExpired ? 'Resend invite (expired)' : 'Resend invite'}
                      >
                        Resend
                      </button>
                      <button
                        onClick={() => handleCancelInvite(inv.id, inv.invitedEmail)}
                        disabled={actionPending}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* ── Active members section ── */}
        {(members.length > 0 || invites.length === 0) && (
          <>
            {invites.length > 0 && (
              <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Active Members ({members.length})
                </p>
              </div>
            )}
            <ul className="divide-y">
              {members.map((m) => {
                const reg = REG_BADGE[m.registrationStatus] ?? REG_BADGE.none
                const waiver = leagueHasWaiver ? (WAIVER_BADGE[m.waiverStatus] ?? WAIVER_BADGE.not_signed) : null
                const needsAction = m.registrationStatus !== 'active' || (leagueHasWaiver && m.waiverStatus === 'not_signed')
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar avatarUrl={m.avatarUrl} name={m.name || m.email} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.name || m.email}
                          {m.isMe && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                        </p>
                        {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                        {/* Status pills */}
                        {leagueId && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${reg.className}`}>
                              {reg.label}
                            </span>
                            {waiver && waiver.label && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${waiver.className}`}>
                                {waiver.label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!m.isMe && needsAction && (
                          <button
                            onClick={() => openReminder(m.id, m.name || m.email, 'member')}
                            disabled={actionPending}
                            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                            title="Send reminder"
                          >
                            Remind
                          </button>
                        )}
                        {!m.isMe && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name || m.email)}
                            disabled={actionPending}
                            className="text-xs text-red-400 hover:text-red-600 transition-colors px-1"
                            title="Remove from team"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Role + position selects */}
                    <div className="flex gap-2 mt-2 pl-10">
                      {positions.length > 0 && (
                        <select
                          value={m.position ?? ''}
                          onChange={(e) => handlePositionChange(m.id, e.target.value)}
                          className="flex-1 min-w-0 text-base md:text-xs border rounded px-2 py-1 bg-white"
                          title="Position"
                        >
                          <option value="">Position…</option>
                          {positions.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      )}
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
                        className={`text-base md:text-xs border rounded px-2 py-1 bg-white ${positions.length > 0 ? 'w-24 shrink-0' : 'flex-1'}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </li>
                )
              })}
              {members.length === 0 && invites.length > 0 && (
                <li className="px-5 py-4 text-center text-sm text-gray-400">No active members yet.</li>
              )}
              {members.length === 0 && invites.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-gray-400">No members yet. Add a player below.</li>
              )}
            </ul>
          </>
        )}

        {/* Global feedback */}
        {(actionError || actionSuccess) && (
          <div className={`px-5 py-2.5 text-sm border-t ${actionError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {actionError ?? actionSuccess}
          </div>
        )}

        {/* Add player */}
        <div className="px-5 py-4 border-t bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Player</p>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="player@example.com"
              required
              className="flex-1 border rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as Role)}
              className="border rounded-md px-3 py-2 text-base"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={addPending}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {addPending ? '…' : 'Add'}
            </button>
          </form>
          {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
          {addSuccess && <p className="text-xs text-green-600 mt-2">{addSuccess}</p>}
        </div>
      </div>

      {/* ── Reminder modal ── */}
      {reminderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-lg mb-1">
              {reminderTarget.type === 'invite' ? 'Resend Invite' : 'Send Reminder'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {reminderTarget.type === 'invite'
                ? `Resend the invite email to ${reminderTarget.name}.`
                : `Send a reminder to ${reminderTarget.name} to complete their registration.`}
            </p>
            {reminderTarget.type === 'member' && (
              <textarea
                value={reminderMsg}
                onChange={(e) => setReminderMsg(e.target.value)}
                placeholder="Optional message…"
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReminderTarget(null)}
                className="px-4 py-2 text-sm rounded border text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReminder}
                disabled={reminderPending || actionPending}
                className="px-4 py-2 text-sm font-semibold rounded text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {(reminderPending || actionPending) ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
