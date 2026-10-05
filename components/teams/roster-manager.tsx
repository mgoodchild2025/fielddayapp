'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { captainSetMemberRole, captainRemoveTeamMember, sendRosterReminder } from '@/actions/teams'
import { resendTeamInvite, cancelTeamInvitation } from '@/actions/invitations'
import { setTeamMemberPosition } from '@/actions/positions'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { Copy, Check } from 'lucide-react'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { Overlay, useRetained } from '@/components/ui/overlay'
import { toast } from 'sonner'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'

type Role = 'captain' | 'coach' | 'player' | 'sub'

const ROLES: { value: Role; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'sub', label: 'Sub' },
]

export interface PendingInvite {
  id: string
  token: string
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
  leagueHasWaiver: boolean
  initialMembers: ActiveMember[]
  initialInvites: PendingInvite[]
  positions?: string[]
  teamCode?: string | null
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
  leagueHasWaiver,
  initialMembers,
  initialInvites,
  positions = [],
  teamCode = null,
}: Props) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null)

  const [actionPending, startActionTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  // Feedback goes in a toast: it rendered at the bottom of the roster card,
  // a screen away from the row (or sheet) the captain had just acted on.
  useEffect(() => { if (actionError) toast.error(actionError) }, [actionError])
  useEffect(() => { if (actionSuccess) toast.success(actionSuccess) }, [actionSuccess])

  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const joinUrl = teamCode && origin ? `${origin}/join/${teamCode}` : null

  // Reminder modal state
  const [reminderTarget, setReminderTarget] = useState<{ id: string; name: string; type: 'member' | 'invite' } | null>(null)
  // Keeps the sheet's text while it plays its exit.
  const shownReminder = useRetained(reminderTarget)
  const [reminderMsg, setReminderMsg] = useState('')
  const [reminderPending, startReminderTransition] = useTransition()

  function clearFeedback() {
    setActionError(null)
    setActionSuccess(null)
  }

  function copyToClipboard(text: string, field: 'code' | 'link') {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      announce('Copied to clipboard')
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  // ── Active member actions ──────────────────────────────────────────────────

  function handlePositionChange(memberId: string, position: string) {
    const before = members.find((m) => m.id === memberId)?.position ?? null
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, position: position || null } : m))
    startActionTransition(async () => {
      // A failed save used to leave the new position showing.
      const result = await safeAction(setTeamMemberPosition({ memberId, teamId, position }))
      if (result?.error) {
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, position: before } : m))
        toast.error(`Position not saved — ${result.error}`)
      }
    })
  }

  function handleRoleChange(memberId: string, role: Role) {
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role } : m))
    startActionTransition(async () => {
      const result = await safeAction(captainSetMemberRole(memberId, teamId, role))
      // It used to snap back without saying why.
      if (result.error) { setMembers(initialMembers); toast.error(result.error) }
    })
  }

  async function handleRemoveMember(memberId: string, name: string) {
    if (!(await confirmAction({ title: `Remove ${name} from the team?`, confirmLabel: "Remove", destructive: true }))) return
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

  async function handleCancelInvite(inviteId: string, email: string) {
    if (!(await confirmAction({ title: `Cancel the invitation to ${email}?`, confirmLabel: "Cancel invitation", cancelLabel: "Keep", destructive: true }))) return
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalCount = members.length + invites.length

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden" data-tutorial="roster-section">
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <h2 className="font-semibold">Active Roster</h2>
          <span className="text-xs text-gray-500">{totalCount} player{totalCount !== 1 ? 's' : ''}</span>
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
                  <li key={inv.id} className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
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
                    {/* Phones: actions on their own row — beside the email they
                        squeezed it to ~20px. */}
                    <div className="flex items-center gap-1 shrink-0 max-sm:w-full max-sm:justify-end">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/invite/${inv.token}`
                          navigator.clipboard.writeText(url).then(() => {
                            setCopiedInviteId(inv.id)
                            announce('Invite link copied')
                            setTimeout(() => setCopiedInviteId(null), 2000)
                          })
                        }}
                        className="press text-xs px-3 min-h-10 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                        title="Copy invite link"
                      >
                        {copiedInviteId === inv.id ? <span key="copied" className="fd-fade-in">Copied!</span> : 'Copy link'}
                      </button>
                      <button
                        onClick={() => openReminder(inv.id, inv.invitedEmail, 'invite')}
                        disabled={actionPending}
                        className="press text-xs px-3 min-h-10 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                        title={isExpired ? 'Resend invite (expired)' : 'Resend invite'}
                      >
                        Resend
                      </button>
                      <button
                        onClick={() => handleCancelInvite(inv.id, inv.invitedEmail)}
                        disabled={actionPending}
                        className="press text-xs px-3 min-h-10 rounded border border-gray-200 text-red-600 hover:bg-red-50"
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
                          {m.isMe && <span className="ml-1.5 text-xs text-gray-500">(you)</span>}
                        </p>
                        {m.email && <p className="text-xs text-gray-500 truncate">{m.email}</p>}
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
                            className="press text-xs px-3 min-h-10 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                            title="Send reminder"
                          >
                            Remind
                          </button>
                        )}
                        {!m.isMe && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name || m.email)}
                            disabled={actionPending}
                            className="press inline-flex items-center justify-center min-h-10 min-w-10 -my-2 rounded-full text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Remove from team"
                            aria-label={`Remove ${m.name || m.email} from team`}
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
                          aria-label={`Position for ${m.name || m.email}`}
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
                        aria-label={`Role for ${m.name || m.email}`}
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
                <li className="px-5 py-4 text-center text-sm text-gray-500">No active members yet.</li>
              )}
              {members.length === 0 && invites.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-gray-500">No members yet. Add a player below.</li>
              )}
            </ul>
          </>
        )}


        {/* ── Join code & link ── */}
        {(teamCode || joinUrl) && (
          <div className="border-t bg-gray-50 px-5 py-4 space-y-3" data-tutorial="join-info">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Team Join Info
            </p>

            {/* Join code row */}
            {teamCode && (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 mb-0.5">Join Code</p>
                  <p className="font-mono font-bold text-lg tracking-widest text-gray-800 leading-none">
                    {teamCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(teamCode, 'code')}
                  className="press shrink-0 flex items-center gap-1.5 px-3 min-h-10 rounded-lg border text-xs font-medium"
                  style={
                    copiedField === 'code'
                      ? { borderColor: '#22c55e', color: '#16a34a', backgroundColor: '#f0fdf4' }
                      : { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary-ink, var(--brand-primary))', backgroundColor: 'white' }
                  }
                  aria-label="Copy join code"
                >
                  {copiedField === 'code'
                    ? <span key="copied" className="fd-fade-in inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Copied</span>
                    : <><Copy className="w-3.5 h-3.5" /> Copy</>
                  }
                </button>
              </div>
            )}

            {/* Join link row */}
            {joinUrl && (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 mb-0.5">Join Link</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{joinUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(joinUrl, 'link')}
                  className="press shrink-0 flex items-center gap-1.5 px-3 min-h-10 rounded-lg border text-xs font-medium"
                  style={
                    copiedField === 'link'
                      ? { borderColor: '#22c55e', color: '#16a34a', backgroundColor: '#f0fdf4' }
                      : { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary-ink, var(--brand-primary))', backgroundColor: 'white' }
                  }
                  aria-label="Copy join link"
                >
                  {copiedField === 'link'
                    ? <span key="copied" className="fd-fade-in inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Copied</span>
                    : <><Copy className="w-3.5 h-3.5" /> Copy</>
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reminder modal — shared Overlay (sheet on phones, scroll lock, Escape) ── */}
      <Overlay
        open={!!reminderTarget}
        onClose={() => setReminderTarget(null)}
        variant="sheet"
        labelledBy="roster-reminder-title"
        panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-6"
      >
        {shownReminder && (<>
            <h3 id="roster-reminder-title" className="font-semibold text-lg mb-1">
              {shownReminder.type === 'invite' ? 'Resend Invite' : 'Send Reminder'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {shownReminder.type === 'invite'
                ? `Resend the invite email to ${shownReminder.name}.`
                : `Send a reminder to ${shownReminder.name} to complete their registration.`}
            </p>
            {shownReminder.type === 'member' && (
              <textarea
                aria-label="Message"
                data-autofocus
                value={reminderMsg}
                onChange={(e) => setReminderMsg(e.target.value)}
                placeholder="Optional message…"
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-base sm:text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReminderTarget(null)}
                className="press min-h-11 px-4 text-sm rounded border text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReminder}
                disabled={reminderPending || actionPending}
                className="press min-h-11 px-5 text-sm font-semibold rounded bg-brand-primary text-on-brand disabled:opacity-50"
              >
                {(reminderPending || actionPending) ? 'Sending…' : 'Send'}
              </button>
            </div>
        </>)}
      </Overlay>
    </>
  )
}
