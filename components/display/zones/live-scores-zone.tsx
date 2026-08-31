'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Live Scores zone ──────────────────────────────────────────────────────────
// Renders whatever scoreboards are actively broadcasting for this event.
// Boards arrive over the event's Realtime broadcast channel (ephemeral — no
// tables); one that goes quiet for STALE_MS is dropped, so closing the
// scoreboard on the phone takes the game off the wall automatically.

const STALE_MS = 75_000

type Board = {
  gameId: string
  court: string | null
  mode: 'free' | 'sets'
  teamA: { name: string; color: string | null }
  teamB: { name: string; color: string | null }
  a: number
  b: number
  setsWonA: number
  setsWonB: number
  setNumber: number
  final: boolean
  ts: number
  receivedAt: number
}

interface Props {
  leagueId: string
  theme: 'dark' | 'light'
}

export function LiveScoresZone({ leagueId, theme }: Props) {
  const [boards, setBoards] = useState<Record<string, Board>>({})
  const isDark = theme === 'dark'

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`scoreboard:${leagueId}`)
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        const p = payload as Omit<Board, 'receivedAt'>
        if (!p?.gameId) return
        setBoards((prev) => ({ ...prev, [p.gameId]: { ...p, receivedAt: Date.now() } }))
      })
      .subscribe()

    const prune = setInterval(() => {
      setBoards((prev) => {
        const now = Date.now()
        const fresh = Object.fromEntries(Object.entries(prev).filter(([, b]) => now - b.receivedAt < STALE_MS))
        return Object.keys(fresh).length === Object.keys(prev).length ? prev : fresh
      })
    }, 10_000)

    return () => {
      clearInterval(prune)
      supabase.removeChannel(channel)
    }
  }, [leagueId])

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

function BoardCard({ board, isDark, big }: { board: Board; isDark: boolean; big: boolean }) {
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
