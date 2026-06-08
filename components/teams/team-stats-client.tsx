'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TeamAvatar } from '@/components/ui/team-avatar'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SeasonResult = {
  gameId: string
  scheduledAt: string
  opponentId: string
  opponentName: string
  opponentColor: string | null
  opponentLogoUrl: string | null
  homeScore: number | null
  awayScore: number | null
  isHome: boolean
  outcome: 'W' | 'L' | 'T' | 'upcoming'
}

export type H2HRecord = {
  opponentId: string
  opponentName: string
  opponentColor: string | null
  opponentLogoUrl: string | null
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  games: SeasonResult[]
}

interface Props {
  h2h: H2HRecord[]
  timezone: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function OutcomeBadge({ outcome }: { outcome: SeasonResult['outcome'] }) {
  if (outcome === 'upcoming') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
        Upcoming
      </span>
    )
  }
  const cfg = {
    W: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    L: { bg: 'bg-red-50',     text: 'text-red-600'     },
    T: { bg: 'bg-amber-50',   text: 'text-amber-700'   },
  }[outcome]
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text} uppercase tracking-wide`}>
      {outcome}
    </span>
  )
}

// ── H2H Accordion ─────────────────────────────────────────────────────────────

function H2HRow({ record }: { record: H2HRecord }) {
  const [open, setOpen] = useState(false)
  const { opponentId, opponentName, opponentColor, opponentLogoUrl, wins, draws, losses, goalsFor, goalsAgainst, games } = record
  const gd = goalsFor - goalsAgainst

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <TeamAvatar logoUrl={opponentLogoUrl} color={opponentColor} name={opponentName} size="sm" />
        <Link
          href={`/teams/${opponentId}/stats`}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 font-semibold text-sm text-gray-900 hover:underline truncate relative z-10"
        >
          {opponentName}
        </Link>

        {/* W-D-L summary */}
        <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500 tabular-nums">
          <span className="font-bold text-emerald-600">{wins}W</span>
          {draws > 0 && <span className="font-bold text-amber-600">{draws}D</span>}
          <span className="font-bold text-red-500">{losses}L</span>
          <span className="text-gray-400">
            {goalsFor}–{goalsAgainst}
            {' '}
            <span className={gd > 0 ? 'text-emerald-600' : gd < 0 ? 'text-red-500' : 'text-gray-400'}>
              ({gd > 0 ? '+' : ''}{gd})
            </span>
          </span>
        </div>

        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        }
      </button>

      {/* Expanded game list */}
      {open && (
        <div className="border-t divide-y">
          {games.map(g => {
            const myScore = g.isHome ? g.homeScore : g.awayScore
            const theirScore = g.isHome ? g.awayScore : g.homeScore
            return (
              <Link
                key={g.gameId}
                href={`/games/${g.gameId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-xs text-gray-400 w-16 shrink-0">{formatShortDate(g.scheduledAt)}</span>
                <span className="text-xs text-gray-500 flex-1">
                  {g.outcome === 'upcoming' ? 'Upcoming' : `${myScore ?? '?'}–${theirScore ?? '?'}`}
                </span>
                <OutcomeBadge outcome={g.outcome} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TeamStatsClient({ h2h, timezone }: Props) {
  if (h2h.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border">
        No opponents yet this season.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {h2h.map(record => (
        <H2HRow key={record.opponentId} record={record} />
      ))}
    </div>
  )
}
