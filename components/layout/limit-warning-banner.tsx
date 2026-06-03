'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

type Props = {
  playerCount: number
  playerLimit: number | null   // null = unlimited
  leagueCount: number
  leagueLimit: number | null   // null = unlimited
}

function pct(count: number, limit: number | null): number {
  if (!limit) return 0
  return Math.round((count / limit) * 100)
}

export function LimitWarningBanner({ playerCount, playerLimit, leagueCount, leagueLimit }: Props) {
  const playerPct  = pct(playerCount, playerLimit)
  const leaguePct  = pct(leagueCount, leagueLimit)

  // At capacity
  if (playerLimit !== null && playerCount >= playerLimit) {
    return (
      <div className="w-full px-4 py-2 text-sm bg-red-600 text-white flex items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          You&apos;ve reached your player limit ({playerCount}/{playerLimit}).
          New players cannot register until you upgrade.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Upgrade plan →
        </Link>
      </div>
    )
  }

  if (leagueLimit !== null && leagueCount >= leagueLimit) {
    return (
      <div className="w-full px-4 py-2 text-sm bg-red-600 text-white flex items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          You&apos;ve reached your active league limit ({leagueCount}/{leagueLimit}).
          Archive a league or upgrade to create more.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Upgrade plan →
        </Link>
      </div>
    )
  }

  // Approaching player limit (≥80%)
  if (playerLimit !== null && playerPct >= 80) {
    return (
      <div className="w-full px-4 py-2 text-sm bg-amber-500 text-white flex items-center justify-between gap-4">
        <span>
          You&apos;re at {playerPct}% of your player limit ({playerCount}/{playerLimit}).
          Upgrade before your league fills up.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Upgrade →
        </Link>
      </div>
    )
  }

  // Approaching league limit (≥80%)
  if (leagueLimit !== null && leaguePct >= 80) {
    return (
      <div className="w-full px-4 py-2 text-sm bg-amber-500 text-white flex items-center justify-between gap-4">
        <span>
          You&apos;re at {leaguePct}% of your active league limit ({leagueCount}/{leagueLimit}).
          Upgrade to run more leagues simultaneously.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Upgrade →
        </Link>
      </div>
    )
  }

  return null
}
