'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
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

export const STALE_MS = 75_000

/**
 * Fold one broadcast into the board map.
 *
 * Boards for other games keep their identity: the per-row hook below bails out
 * of a re-render by reference comparison, so preserving those references is
 * what stops one court's point re-rendering every other row on the page.
 */
export function mergeBoard(
  boards: Record<string, LiveBoard>,
  incoming: LiveBoard,
): Record<string, LiveBoard> {
  return { ...boards, [incoming.gameId]: incoming }
}

/** Drop boards quiet for longer than STALE_MS. Returns the same object when
 *  nothing expired, so quiet ticks cost no renders anywhere. */
export function pruneStale(
  boards: Record<string, LiveBoard>,
  now: number,
): Record<string, LiveBoard> {
  const fresh = Object.fromEntries(
    Object.entries(boards).filter(([, b]) => now - b.receivedAt < STALE_MS),
  )
  return Object.keys(fresh).length === Object.keys(boards).length ? boards : fresh
}

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
      entry.boards = mergeBoard(entry.boards, { ...p, receivedAt: Date.now() })
      entry.listeners.forEach((l) => l(entry.boards))
    })
    .subscribe()

  entry.pruner = setInterval(() => {
    const fresh = pruneStale(entry.boards, Date.now())
    if (fresh !== entry.boards) {
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

/**
 * One board, for a surface that renders a single game — a schedule row badge.
 *
 * `useLiveScores` hands back the whole map, so every consumer re-rendered on
 * every broadcast, heartbeat and prune tick for the event. On a four-court
 * night that is continuous churn across every row of a schedule the viewer is
 * also trying to scroll. This subscribes to the same shared channel but only
 * re-renders when this game's own board changes.
 */
export function useLiveScore(
  leagueId: string | null | undefined,
  gameId: string | null | undefined,
): LiveBoard | undefined {
  // useSyncExternalStore is the right shape for this: the registry IS an
  // external store, and it handles the initial read without seeding state
  // from inside an effect.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!leagueId || !gameId) return () => {}
      const entry = acquire(leagueId)
      entry.refs++
      const listener: Listener = () => onStoreChange()
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
        entry.refs--
        if (entry.refs <= 0) {
          clearInterval(entry.pruner)
          entry.supabase.removeChannel(entry.channel)
          registry.delete(leagueId)
        }
      }
    },
    [leagueId, gameId],
  )

  // Boards for untouched games keep their identity across a broadcast (see
  // mergeBoard), so this returns a stable reference and React skips the
  // re-render when another court scores.
  const getSnapshot = useCallback(() => {
    if (!leagueId || !gameId) return undefined
    return registry.get(leagueId)?.boards[gameId]
  }, [leagueId, gameId])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
