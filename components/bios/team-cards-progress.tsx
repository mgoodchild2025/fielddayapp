'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { nudgeTeamCards } from '@/actions/player-bios'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { safeAction } from '@/lib/action-errors'

/**
 * "Player cards · 8 of 12 done" on the team page. The viewer's own gap gets a
 * link to finish it; the captain/coach gets one button that asks the rest
 * (a teammate asking beats the app asking). Each player is nudged at most
 * once a season, enforced by the action.
 */
export function TeamCardsProgress({
  teamId,
  done,
  total,
  myGapText,
  canNudge,
  othersMissing,
}: {
  teamId: string
  done: number
  total: number
  /** "your number and a photo" when the viewer's own card is incomplete. */
  myGapText: string | null
  canNudge: boolean
  /** Teammates (not the viewer) whose cards are incomplete. */
  othersMissing: number
}) {
  const [sending, setSending] = useState(false)
  const [sentAll, setSentAll] = useState(false)
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)

  async function nudge() {
    const ok = await confirmAction({
      title: `Nudge ${othersMissing} teammate${othersMissing === 1 ? '' : 's'}?`,
      message: 'Each gets one notification asking them to finish their player card. You can only do this once a season per player.',
      confirmLabel: 'Send nudges',
    })
    if (!ok) return
    setSending(true)
    const r = await safeAction(nudgeTeamCards(teamId))
    setSending(false)
    if (r.error) { toast.error(r.error); return }
    setSentAll(true)
    if (r.sent > 0) {
      toast.success(`Nudged ${r.sent} teammate${r.sent === 1 ? '' : 's'}${r.alreadyNudged > 0 ? ` (${r.alreadyNudged} already nudged this season)` : ''}`)
    } else {
      toast(r.alreadyNudged > 0 ? 'Everyone missing a card has already been nudged this season.' : 'Nobody to nudge — all cards are done.')
    }
  }

  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">
          Player cards <span className="text-gray-500 font-normal">· {done} of {total} done</span>
        </p>
        {canNudge && othersMissing > 0 && !sentAll && (
          <button
            type="button"
            onClick={nudge}
            disabled={sending}
            className="press shrink-0 min-h-10 rounded-md border px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {sending ? 'Sending…' : `Nudge the ${othersMissing === 1 ? 'other one' : `other ${othersMissing}`}`}
          </button>
        )}
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-label="Player cards done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
      </div>
      {myGapText && (
        <Link href="/profile#bio" className="press mt-2 inline-flex items-center min-h-10 -mb-2 text-sm font-medium text-brand-ink hover:underline">
          Yours needs {myGapText}. Finish it →
        </Link>
      )}
    </div>
  )
}
