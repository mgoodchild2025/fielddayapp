'use client'

import { useLiveScores, type LiveBoard } from '@/lib/use-live-scores'

// ── Live Scores zone ──────────────────────────────────────────────────────────
// Renders whatever scoreboards are actively broadcasting for this event, via
// the shared live-scores feed (see lib/use-live-scores). Boards that go quiet
// drop off, so closing the scoreboard on the phone clears the wall.

interface Props {
  leagueId: string
  theme: 'dark' | 'light'
}

export function LiveScoresZone({ leagueId, theme }: Props) {
  const boards = useLiveScores(leagueId)
  const isDark = theme === 'dark'

  const list = Object.values(boards).sort((x, y) => (x.court ?? '').localeCompare(y.court ?? '') || x.ts - y.ts)
  const subtext = isDark ? '#a1a1aa' : '#6b7280'

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <span style={{ fontSize: 32, opacity: 0.3 }}>🔢</span>
        <p style={{ color: subtext, fontSize: 14 }}>
          No live games right now — scores appear here when a scoreboard opens.
        </p>
      </div>
    )
  }

  // 1 board fills the zone; 2 stack; more flow in a two-column grid.
  const gridStyle: React.CSSProperties =
    list.length === 1
      ? { display: 'grid', gridTemplateColumns: '1fr' }
      : list.length === 2
      ? { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' }
      : { display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr' }

  return (
    <div className="h-full w-full p-3 gap-3" style={gridStyle}>
      {list.map((board) => (
        <BoardCard key={board.gameId} board={board} isDark={isDark} big={list.length === 1} />
      ))}
    </div>
  )
}

function BoardCard({ board, isDark, big }: { board: LiveBoard; isDark: boolean; big: boolean }) {
  const scoreSize = big ? 'clamp(48px, 14vh, 140px)' : 'clamp(32px, 7vh, 72px)'
  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col min-h-0"
      style={{ background: isDark ? '#111826' : '#ffffff', border: `1px solid ${isDark ? '#26304233' : '#e5e7eb'}` }}
    >
      <div
        className="flex items-center justify-between px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
        style={{ color: isDark ? '#8b98ad' : '#6b7280' }}
      >
        <span>{board.court ?? 'Live'}</span>
        <span>
          {board.final ? 'FINAL' : board.mode === 'sets' ? `SET ${board.setNumber} · LIVE` : 'LIVE'}
          {!board.final && <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1.5 animate-pulse align-middle" />}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {([{ meta: board.teamA, pts: board.a, won: board.setsWonA }, { meta: board.teamB, pts: board.b, won: board.setsWonB }]).map(
          (row, i) => (
            <div
              key={i}
              className="flex-1 min-h-0 flex items-center justify-between px-5"
              style={{ background: `linear-gradient(90deg, ${row.meta.color ?? (i === 0 ? '#0E9F6E' : '#2563EB')}, color-mix(in srgb, ${row.meta.color ?? (i === 0 ? '#0E9F6E' : '#2563EB')} 72%, black))` }}
            >
              <div className="min-w-0 flex items-center gap-3">
                <span className="text-white font-bold uppercase tracking-wide truncate" style={{ fontSize: big ? 'clamp(18px, 3.4vh, 34px)' : 'clamp(13px, 2vh, 20px)' }}>
                  {row.meta.name}
                </span>
                {board.mode === 'sets' && row.won > 0 && (
                  <span className="flex gap-1 shrink-0">
                    {Array.from({ length: row.won }, (_, k) => (
                      <span key={k} className="w-2 h-2 rounded-full bg-white/90" />
                    ))}
                  </span>
                )}
              </div>
              <span className="text-white font-extrabold tabular-nums leading-none shrink-0" style={{ fontSize: scoreSize, textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                {row.pts}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
