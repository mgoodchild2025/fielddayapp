import { describe, it, expect } from 'vitest'
import { mergeBoard, pruneStale, STALE_MS, type LiveBoard } from './use-live-scores'

function board(gameId: string, receivedAt: number, a = 0): LiveBoard {
  return {
    gameId, court: null, mode: 'free',
    teamA: { name: 'Home', color: null }, teamB: { name: 'Away', color: null },
    a, b: 0, setsWonA: 0, setsWonB: 0, setNumber: 1, final: false,
    ts: receivedAt, receivedAt,
  }
}

describe('mergeBoard', () => {
  it('adds a board that was not there', () => {
    const out = mergeBoard({}, board('g1', 1000))
    expect(Object.keys(out)).toEqual(['g1'])
  })

  it('replaces the board for the game that broadcast', () => {
    const before = { g1: board('g1', 1000, 5) }
    const out = mergeBoard(before, board('g1', 2000, 6))
    expect(out.g1.a).toBe(6)
  })

  it('keeps other boards reference-identical — this is what stops the render storm', () => {
    const other = board('g2', 1000)
    const before = { g1: board('g1', 1000), g2: other }
    const out = mergeBoard(before, board('g1', 2000, 9))
    // g2 must be the SAME object, so a per-row hook watching g2 bails out.
    expect(out.g2).toBe(other)
    expect(out.g1).not.toBe(before.g1)
  })

  it('does not mutate the map it was given', () => {
    const before = { g1: board('g1', 1000, 1) }
    mergeBoard(before, board('g1', 2000, 2))
    expect(before.g1.a).toBe(1)
  })
})

describe('pruneStale', () => {
  const now = 1_000_000

  it('returns the very same object when nothing expired, so quiet ticks cost no renders', () => {
    const boards = { g1: board('g1', now - 1000) }
    expect(pruneStale(boards, now)).toBe(boards)
  })

  it('drops a board quiet for longer than the stale window', () => {
    const boards = { g1: board('g1', now - STALE_MS - 1), g2: board('g2', now - 500) }
    const out = pruneStale(boards, now)
    expect(Object.keys(out)).toEqual(['g2'])
  })

  it('keeps a board sitting just inside the window', () => {
    const boards = { g1: board('g1', now - STALE_MS + 1000) }
    expect(pruneStale(boards, now)).toBe(boards)
  })

  it('preserves the identity of surviving boards', () => {
    const fresh = board('g2', now - 500)
    const out = pruneStale({ g1: board('g1', now - STALE_MS - 1), g2: fresh }, now)
    expect(out.g2).toBe(fresh)
  })

  it('handles an empty map', () => {
    const empty = {}
    expect(pruneStale(empty, now)).toBe(empty)
  })
})
