'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { awardLeagueMedals, revokeMedal } from '@/actions/medals'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { safeAction } from '@/lib/action-errors'
import { toast } from 'sonner'

/**
 * Admin view of a league's awarded medals: who won what, exactly as players
 * see it in their trophy cases — team, placement, every recipient by name —
 * with revoke for disputes. Carries the 🏅 Award Medals button itself, so it is
 * reachable for org AND league admins, with or without a playoff config
 * (standalone brackets included) — awarding is idempotent (replaces the
 * league's medals; no re-notification for unchanged placements).
 */

export interface AdminMedalRow {
  id: string
  placement: 'gold' | 'silver' | 'bronze' | 'tier_champion'
  label: string
  teamName: string
  awardedAt: string
  recipients: string[]
}

const GLYPH: Record<AdminMedalRow['placement'], string> = {
  gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆',
}

export function AdminMedalsPanel({ medals, leagueId, timeZone = 'America/Toronto' }: { medals: AdminMedalRow[]; leagueId: string; timeZone?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [awardMsg, setAwardMsg] = useState<string | null>(null)
  const [isAwarding, startAward] = useTransition()

  function handleAward() {
    setErr(null); setAwardMsg(null)
    startAward(async () => {
      const r = await awardLeagueMedals(leagueId)
      if (r.error) { setErr(r.error); return }
      setAwardMsg(r.awarded > 0
        ? `${r.awarded} medal${r.awarded !== 1 ? 's' : ''} written from the bracket results.`
        : 'No finished bracket to award from yet — the title match needs a result.')
      router.refresh()
    })
  }

  // Takes the medal out of every recipient's trophy case — confirm in-app
  // (the old inline "Revoke? Yes / No" were 11px words side by side).
  async function handleRevoke(m: AdminMedalRow) {
    if (!(await confirmAction({
      title: `Revoke ${m.label ?? 'this medal'}?`,
      message: `It's removed from ${m.teamName ?? 'the team'}'s players' trophy cases. Re-run Award Medals to bring it back.`,
      confirmLabel: 'Revoke medal',
      destructive: true,
    }))) return
    setErr(null)
    startTransition(async () => {
      const r = await safeAction(revokeMedal(m.id, leagueId))
      if (r.error) { setErr(r.error); return }
      toast.success('Medal revoked')
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medals Awarded</p>
          <p className="text-xs text-gray-500">What players see in their trophy cases</p>
        </div>
        <button
          type="button"
          onClick={handleAward}
          disabled={isAwarding || isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          title="Write medals from the bracket results — runs automatically when the event completes; re-run after a correction"
        >
          {isAwarding ? 'Awarding…' : '🏅 Award Medals'}
        </button>
      </div>
      {err && <p role="alert" className="px-5 py-2 text-xs text-red-600 border-b">{err}</p>}
      {awardMsg && <p className="px-5 py-2 text-xs text-green-700 bg-green-50 border-b">{awardMsg}</p>}
      {medals.length === 0 && (
        <p className="px-5 py-6 text-sm text-gray-500 text-center">
          No medals yet. They are awarded automatically when the event is marked complete, or tap Award Medals once the title match has a result.
        </p>
      )}
      <ul className="divide-y">
        {medals.map((m) => (
          <li key={m.id} className="px-5 py-3 flex items-start gap-3">
            <span className="text-2xl leading-none shrink-0" aria-hidden>{GLYPH[m.placement]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{m.teamName}</span>
                <span className="text-gray-500"> — {m.label}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {m.recipients.length > 0 ? m.recipients.join(', ') : 'No roster members at award time'}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-xs text-gray-500 tabular-nums">
                {new Date(m.awardedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone })}
              </span>
              <button
                type="button"
                onClick={() => handleRevoke(m)}
                disabled={isPending}
                className="press inline-flex items-center min-h-10 px-2 -mr-2 text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-40"
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
