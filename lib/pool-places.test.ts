import { describe, expect, it } from 'vitest'
import { orderByPoolPlace, separateFirstRoundPools, describePlaceTiers, orderPoolStandingsByPlace } from './pool-places'
import { generateFirstRoundPairings } from './bracket'

type T = { id: string; wins: number }
const byWins = (ts: T[]) => [...ts].sort((a, b) => b.wins - a.wins)
const pool = (name: string, wins: number[]) => wins.map((w, i) => ({ id: `${name}${i + 1}`, wins: w }))

describe('orderByPoolPlace', () => {
  // 12 teams, 3 pools of 4 (already sorted best-first within each pool)
  const A = pool('A', [3, 2, 1, 0])
  const B = pool('B', [3, 2, 2, 0]) // B3 has the best third-place record
  const C = pool('C', [2, 2, 0, 1])
  const order = orderByPoolPlace([A, B, C], byWins)

  it('puts every winner first, then runners-up, then thirds by record', () => {
    expect(order.map((e) => e.team.id)).toEqual([
      'A1', 'B1', 'C1', // winners, best record first
      'A2', 'B2', 'C2', // runners-up
      'B3', 'A3', 'C3', // thirds: B3 (2 wins), A3 (1), C3 (0)
      'C4', 'A4', 'B4', // fourths
    ])
  })

  it('gives Gold the two best thirds and Silver the rest', () => {
    const gold = order.slice(0, 8).map((e) => e.team.id)
    const silver = order.slice(8, 12).map((e) => e.team.id)
    expect(gold).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'B3', 'A3'])
    expect(silver).toEqual(['C3', 'C4', 'A4', 'B4'])
  })

  it('handles pools of different sizes', () => {
    const out = orderByPoolPlace([pool('A', [2, 1, 0]), pool('B', [3, 2, 1, 0])], byWins)
    expect(out.map((e) => e.team.id)).toEqual(['B1', 'A1', 'B2', 'A2', 'B3', 'A3', 'B4'])
  })
})

describe('separateFirstRoundPools', () => {
  const pairs8 = generateFirstRoundPairings(8) // [1,8],[4,5],[3,6],[2,7]

  it('swaps a same-pool first-round pair within the same place', () => {
    // seed 1 = A1 and seed 8 = A3 would meet; seed 7 is B3 → swap 7 and 8
    const order = orderByPoolPlace([pool('A', [3, 2, 1, 0]), pool('B', [2, 2, 2, 0]), pool('C', [1, 1, 0, 0])], byWins).slice(0, 8)
    expect(order[0].team.id).toBe('A1')
    expect(order[7].team.id).toBe('A3')
    const fixed = separateFirstRoundPools(order, pairs8)
    for (const [a, b] of pairs8) expect(fixed[a - 1].poolIndex).not.toBe(fixed[b - 1].poolIndex)
    // nobody changed level
    expect(fixed.map((e) => e.place)).toEqual(order.map((e) => e.place))
  })

  it('leaves an order with no clashes alone', () => {
    const order = orderByPoolPlace([pool('A', [3, 2, 1, 0]), pool('B', [3, 2, 2, 0]), pool('C', [2, 2, 0, 1])], byWins).slice(0, 8)
    const before = order.map((e) => e.team.id)
    const after = separateFirstRoundPools(order, pairs8).map((e) => e.team.id)
    const clash = pairs8.some(([a, b]) => order[a - 1].poolIndex === order[b - 1].poolIndex)
    if (!clash) expect(after).toEqual(before)
  })

  it('ignores byes', () => {
    const order = orderByPoolPlace([pool('A', [2, 1]), pool('B', [2, 1])], byWins).slice(0, 3)
    expect(separateFirstRoundPools(order, generateFirstRoundPairings(4))).toHaveLength(3)
  })
})

describe('describePlaceTiers', () => {
  it('words the 12-team, 3-pool, Gold 8 / Silver 4 setup', () => {
    expect(describePlaceTiers([4, 4, 4], [
      { name: 'Gold', seedFrom: 1, seedTo: 8 },
      { name: 'Silver', seedFrom: 9, seedTo: 12 },
    ])).toEqual([
      'Gold: all 3 pool winners, all 3 runners-up and the best 2 of 3 3rd places',
      'Silver: the remaining 3rd place and all 3 4th places',
    ])
  })
})

describe('a 12-team, 3-pool tournament: Gold 8, Silver 4', () => {
  // Pool play, 3 games each.
  // A3 1–2 (pd -5), B3 1–2 (pd +4), C3 0–3 → best two thirds are B3 then A3.
  const st = (id: string, pool: string, w: number, l: number, pf: number, pa: number) =>
    ({ teamId: id, teamName: id, poolId: pool, wins: w, losses: l, ties: 0, pointsFor: pf, pointsAgainst: pa })
  const A = [st('A2', 'A', 2, 1, 60, 55), st('A1', 'A', 3, 0, 63, 40), st('A4', 'A', 0, 3, 40, 63), st('A3', 'A', 1, 2, 50, 55)]
  const B = [st('B1', 'B', 3, 0, 63, 45), st('B3', 'B', 1, 2, 58, 54), st('B2', 'B', 2, 1, 59, 50), st('B4', 'B', 0, 3, 41, 63)]
  const C = [st('C1', 'C', 2, 1, 60, 50), st('C2', 'C', 2, 1, 55, 52), st('C3', 'C', 1, 2, 45, 58), st('C4', 'C', 1, 2, 44, 60)]
  const order = orderPoolStandingsByPlace([A, B, C])

  it('Gold gets every winner and runner-up plus the two best thirds; Silver the rest', () => {
    const ids = order.map((e) => e.team.teamId)
    expect(ids.slice(0, 3).sort()).toEqual(['A1', 'B1', 'C1'])
    expect(ids.slice(3, 6).sort()).toEqual(['A2', 'B2', 'C2'])
    expect(ids.slice(6, 8)).toEqual(['B3', 'A3']) // both 1–2: B3's +4 beats A3's −5
    expect(ids.slice(8, 12).sort()).toEqual(['A4', 'B4', 'C3', 'C4'])
  })

  it('no first-round Gold game is between two teams from the same pool', () => {
    const pairs = generateFirstRoundPairings(8)
    const gold = separateFirstRoundPools(order.slice(0, 8), pairs)
    for (const [a, b] of pairs) expect(gold[a - 1].team.poolId).not.toBe(gold[b - 1].team.poolId)
    expect(gold.slice(0, 3).every((e) => e.place === 1)).toBe(true)
  })
})
