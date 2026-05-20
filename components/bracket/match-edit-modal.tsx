'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { overrideBracketSlot, updateMatchSchedule } from '@/actions/brackets'
import { adminClearScore } from '@/actions/scores'
import type { BracketMatchData } from './bracket-view'

interface Team {
  id: string
  name: string
}

interface Props {
  match: BracketMatchData
  bracketId: string
  leagueId: string
  allTeams: Team[]
  onClose: () => void
}

export function MatchEditModal({ match, bracketId, leagueId, allTeams, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // Team overrides — only editable if match has no score
  const canEditTeams = match.status !== 'completed'

  function handleClearScore() {
    if (!match.gameId) return
    setErr(null)
    startTransition(async () => {
      const r = await adminClearScore(match.gameId!)
      if (r?.error) { setErr(r.error); return }
      router.refresh()
      onClose()
    })
  }
  const [team1Id, setTeam1Id] = useState<string>(match.team1Id ?? '')
  const [team2Id, setTeam2Id] = useState<string>(match.team2Id ?? '')

  // Schedule fields
  const [court, setCourt] = useState(match.court ?? '')
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!match.scheduledAt) return ''
    // Convert ISO to datetime-local format (YYYY-MM-DDTHH:mm)
    return match.scheduledAt.slice(0, 16)
  })
  const [notes, setNotes] = useState(match.notes ?? '')

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    setErr(null)
    startTransition(async () => {
      const errors: string[] = []

      // Update team slot 1 if changed
      if (canEditTeams && team1Id !== (match.team1Id ?? '')) {
        const r = await overrideBracketSlot({
          matchId: match.id, bracketId, leagueId,
          slot: 1,
          teamId: team1Id || null,
        })
        if (r?.error) errors.push(r.error)
      }

      // Update team slot 2 if changed
      if (canEditTeams && team2Id !== (match.team2Id ?? '')) {
        const r = await overrideBracketSlot({
          matchId: match.id, bracketId, leagueId,
          slot: 2,
          teamId: team2Id || null,
        })
        if (r?.error) errors.push(r.error)
      }

      // Update schedule fields if anything changed
      const scheduleChanged =
        court !== (match.court ?? '') ||
        scheduledAt !== (match.scheduledAt?.slice(0, 16) ?? '') ||
        notes !== (match.notes ?? '')

      if (scheduleChanged) {
        const r = await updateMatchSchedule({
          matchId: match.id,
          leagueId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          court: court || undefined,
          notes: notes || undefined,
        })
        if (r?.error) errors.push(r.error)
      }

      if (errors.length > 0) {
        setErr(errors.join('. '))
        return
      }

      setSaved(true)
      router.refresh()
      setTimeout(onClose, 600)
    })
  }

  const team1Label = match.team1Name ?? match.team1Label ?? 'TBD'
  const team2Label = match.team2Name ?? match.team2Label ?? 'TBD'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Drag handle (mobile) */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-4 pb-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-base text-gray-900">Edit Match</h3>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{team1Label} vs {team2Label}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
          </div>

          {/* Team overrides */}
          {canEditTeams && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Teams</p>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Slot 1 (currently: {team1Label})</label>
                <select
                  value={team1Id}
                  onChange={(e) => setTeam1Id(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">— TBD —</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Slot 2 (currently: {team2Label})</label>
                <select
                  value={team2Id}
                  onChange={(e) => setTeam2Id(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">— TBD —</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {match.status === 'completed' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              Teams cannot be changed after a score has been recorded.
            </p>
          )}

          {/* Schedule */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Schedule</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Court</label>
                <input
                  type="text"
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  placeholder="e.g. A, Court 2"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this match"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Danger zone — clear score */}
          {match.status === 'completed' && match.gameId && (
            <div className="space-y-2 pt-2 border-t border-red-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Danger zone</p>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Clear score…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                    This will remove the score and un-advance the winner from downstream matches.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearScore}
                      disabled={isPending}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    >
                      {isPending ? 'Clearing…' : 'Yes, clear score'}
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {err && <p className="text-sm text-red-500">{err}</p>}
          {saved && <p className="text-sm text-green-600">✓ Saved</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm border text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
