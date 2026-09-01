'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// ── Live scoreboard feed ──────────────────────────────────────────────────────
// One Realtime subscription per event (channel `scoreboard:<leagueId>`), shared
// by every consumer on the page via a module-level registry — twenty schedule
// rows showing live badges cost one channel join, not twenty. Boards quiet for
// STALE_MS drop out, so a closed phone scoreboard clears every surface.
//
// The board key (`gameId`) is games.id for regular games and bracket_matches.id
// for playoff boards — matching the row ids each surface already renders.

export type LiveBoard = {
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

const STALE_MS = 75_000

type Listener = (boards: Record<string, LiveBoard>) => void
type Entry = {
  supabase: SupabaseClient
  channel: RealtimeChannel
  refs: number
  boards: Record<string, LiveBoard>
  listeners: Set<Listener>
  pruner: ReturnType<typeof setInterval>
}

const registry = new Map<string, Entry>()

function acquire(leagueId: string): Entry {
  const existing = registry.get(leagueId)
  if (existing) return existing

  const supabase = createClient()
  const entry: Entry = {
    supabase,
    channel: null as unknown as RealtimeChannel,
    refs: 0,
    boards: {},
    listeners: new Set(),
    pruner: null as unknown as ReturnType<typeof setInterval>,
  }

  entry.channel = supabase
    .channel(`scoreboard:${leagueId}`)
    .on('broadcast', { event: 'score' }, ({ payload }) => {
      const p = payload as Omit<LiveBoard, 'receivedAt'>
      if (!p?.gameId) return
      entry.boards = { ...entry.boards, [p.gameId]: { ...p, receivedAt: Date.now() } }
      entry.listeners.forEach((l) => l(entry.boards))
    })
    .subscribe()

  entry.pruner = setInterval(() => {
    const now = Date.now()
    const fresh = Object.fromEntries(Object.entries(entry.boards).filter(([, b]) => now - b.receivedAt < STALE_MS))
    if (Object.keys(fresh).length !== Object.keys(entry.boards).length) {
      entry.boards = fresh
      entry.listeners.forEach((l) => l(fresh))
    }
  }, 10_000)

  registry.set(leagueId, entry)
  return entry
}

/** Live boards for an event, keyed by game/bracket-match id. Empty when none broadcast. */
export function useLiveScores(leagueId: string | null | undefined): Record<string, LiveBoard> {
  const [boards, setBoards] = useState<Record<string, LiveBoard>>({})

  useEffect(() => {
    if (!leagueId) return
    const entry = acquire(leagueId)
    entry.refs++
    const listener: Listener = (b) => setBoards(b)
    entry.listeners.add(listener)
    setBoards(entry.boards)
    return () => {
      entry.listeners.delete(listener)
      entry.refs--
      if (entry.refs <= 0) {
        clearInterval(entry.pruner)
        entry.supabase.removeChannel(entry.channel)
        registry.delete(leagueId)
      }
    }
  }, [leagueId])

  return boards
}
