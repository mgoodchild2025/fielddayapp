'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { GameKindBadge } from '@/components/schedule/game-kind-badge'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SeasonResult = {
  gameId: string
  scheduledAt: string
  /** Pre-formatted, timezone-aware date label (computed server-side). */
  dateLabel: string
  opponentId: string
  opponentName: string
  opponentColor: string | null
  opponentLogoUrl: string | null
  homeScore: number | null
  awayScore: number | null
  /** Per-set scores from this team's perspective (volleyball only). */
  setScores: { mine: number; theirs: number }[] | null
  /** Pool name when this was a pool match; null for regular-season games. */
  poolName?: string | null
  /** True for playoff bracket games. */
  isPlayoff?: boolean
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** "25–20 · 23–25 · 15–12" from this team's perspective. */
function SetScores({ sets }: { sets: { mine: number; theirs: number }[] }) {
  return (
    <span className="text-[11px] text-gray-400 tabular-nums">
      {sets.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-300"> · </span>}
          {s.mine}–{s.theirs}
        </span>
      ))}
    </span>
  )
}

// ── Season results list ─────────────────────────────────────────────────────

function ResultRow({ result, showKind }: { result: SeasonResult; showKind?: boolean }) {
  const myScore = result.isHome ? result.homeScore : result.awayScore
  const theirScore = result.isHome ? result.awayScore : result.homeScore
  const hasSets = !!result.setScores && result.setScores.length > 0

  return (
    // Overlay link handles game navigation; the opponent link sits above it (z-10).
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors relative">
      <Link href={`/games/${result.gameId}`} className="absolute inset-0" aria-label="View game" />

      <span className="text-xs text-gray-400 w-14 shrink-0 relative z-10">{result.dateLabel}</span>

      <div className="flex items-center gap-2 flex-1 min-w-0 relative z-10">
        <TeamAvatar
          logoUrl={result.opponentLogoUrl}
          color={result.opponentColor}
          name={result.opponentName}
          size="xs"
        />
        <div className="min-w-0">
          {result.opponentId ? (
            <Link
              href={`/teams/${result.opponentId}/stats`}
              className="block text-sm font-medium text-gray-700 hover:underline truncate"
            >
              {result.opponentName}
            </Link>
          ) : (
            <span className="block text-sm font-medium text-gray-700 truncate">{result.opponentName}</span>
          )}
          {(showKind || (hasSets)) && (
            <span className="flex items-center gap-1.5 mt-0.5 sm:hidden">
              {showKind && <GameKindBadge poolName={result.poolName} isPlayoff={result.isPlayoff} />}
              {hasSets && <SetScores sets={result.setScores!} />}
            </span>
          )}
          {showKind && (
            <span className="hidden sm:block mt-0.5">
              <GameKindBadge poolName={result.poolName} isPlayoff={result.isPlayoff} />
            </span>
          )}
        </div>
      </div>

      {/* Set scores inline on wider screens */}
      {hasSets && (
        <span className="hidden sm:block shrink-0 relative z-10">
          <SetScores sets={result.setScores!} />
        </span>
      )}

      {result.outcome !== 'upcoming' && myScore !== null && theirScore !== null && (
        <span className="text-sm tabular-nums font-semibold text-gray-700 shrink-0 relative z-10 text-right">
          {myScore}–{theirScore}
        </span>
      )}

      <div className="relative z-10">
        <OutcomeBadge outcome={result.outcome} />
      </div>
    </div>
  )
}

function ResultsList({
  pastResults,
  upcomingResults,
  showKind,
}: {
  pastResults: SeasonResult[]
  upcomingResults: SeasonResult[]
  showKind?: boolean
}) {
  if (pastResults.length === 0 && upcomingResults.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">
        No games scheduled yet.
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border overflow-hidden divide-y">
      {pastResults.map(r => <ResultRow key={r.gameId} result={r} showKind={showKind} />)}
      {upcomingResults.map(r => <ResultRow key={r.gameId} result={r} showKind={showKind} />)}
    </div>
  )
}

// ── H2H accordion ─────────────────────────────────────────────────────────────

function H2HRow({ record, showKind }: { record: H2HRecord; showKind?: boolean }) {
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
            const hasSets = !!g.setScores && g.setScores.length > 0
            return (
              <Link
                key={g.gameId}
                href={`/games/${g.gameId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-xs text-gray-400 w-14 shrink-0">{g.dateLabel}</span>
                <span className="text-xs text-gray-500 flex-1 tabular-nums">
                  {g.outcome === 'upcoming' ? 'Upcoming' : `${myScore ?? '?'}–${theirScore ?? '?'}`}
                </span>
                {showKind && <GameKindBadge poolName={g.poolName} isPlayoff={g.isPlayoff} />}
                {hasSets && <SetScores sets={g.setScores!} />}
                <OutcomeBadge outcome={g.outcome} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function H2HList({ h2h, showKind }: { h2h: H2HRecord[]; showKind?: boolean }) {
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
        <H2HRow key={record.opponentId} record={record} showKind={showKind} />
      ))}
    </div>
  )
}

// ── Main export: tabbed Results / Head to Head / Players ─────────────────────

interface TabsProps {
  pastResults: SeasonResult[]
  upcomingResults: SeasonResult[]
  h2h: H2HRecord[]
  /** Show a Regular Season / Pool badge on each game (team played pool games). */
  showKind?: boolean
  /** Player-stats leaderboard, rendered on its own tab when provided. */
  playersSlot?: React.ReactNode
}

export function TeamStatsTabs({ pastResults, upcomingResults, h2h, showKind, playersSlot }: TabsProps) {
  const tabs: { key: 'results' | 'h2h' | 'players'; label: string }[] = [
    { key: 'results', label: 'Results' },
    { key: 'h2h', label: 'Head to Head' },
    ...(playersSlot ? [{ key: 'players' as const, label: 'Players' }] : []),
  ]
  const [tab, setTab] = useState<'results' | 'h2h' | 'players'>('results')

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {tabs.map(t => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 sm:px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? 'border-[var(--brand-primary)] text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'results' && <ResultsList pastResults={pastResults} upcomingResults={upcomingResults} showKind={showKind} />}
      {tab === 'h2h' && <H2HList h2h={h2h} showKind={showKind} />}
      {tab === 'players' && playersSlot}
    </div>
  )
}
