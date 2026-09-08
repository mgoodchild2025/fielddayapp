'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { awardLeagueMedals, revokeMedal } from '@/actions/medals'

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

export function AdminMedalsPanel({ medals, leagueId }: { medals: AdminMedalRow[]; leagueId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmId, setConfirmId] = useState<string | null>(null)
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

  function handleRevoke(medalId: string) {
    setConfirmId(null)
    setErr(null)
    startTransition(async () => {
      const r = await revokeMedal(medalId, leagueId)
      if (r.error) { setErr(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medals Awarded</p>
          <p className="text-xs text-gray-400">What players see in their trophy cases</p>
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
      {err && <p className="px-5 py-2 text-xs text-red-500 border-b">{err}</p>}
      {awardMsg && <p className="px-5 py-2 text-xs text-green-700 bg-green-50 border-b">{awardMsg}</p>}
      {medals.length === 0 && (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">
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
              <span className="text-[11px] text-gray-400 tabular-nums">
                {new Date(m.awardedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {confirmId === m.id ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-500">Revoke?</span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(m.id)}
                    disabled={isPending}
                    className="font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="text-gray-400 hover:text-gray-600">No</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(m.id)}
                  disabled={isPending}
                  className="text-[11px] text-gray-300 hover:text-red-500 disabled:opacity-40"
                  title="Remove this medal from every recipient's trophy case"
                >
                  Revoke
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
