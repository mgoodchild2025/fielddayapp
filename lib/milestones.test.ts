import { describe, expect, it } from 'vitest'
import {
  EMPTY_MILESTONE_STATS, milestonesReached, topMilestones, nextMilestone, milestonesToCelebrate,
} from './milestones'

const stats = (s: Partial<typeof EMPTY_MILESTONE_STATS>) => ({ ...EMPTY_MILESTONE_STATS, ...s })

describe('milestonesReached', () => {
  it('a brand-new player has none', () => {
    expect(milestonesReached(EMPTY_MILESTONE_STATS)).toEqual([])
  })
  it('a first event is a milestone', () => {
    const [m] = milestonesReached(stats({ events: 1 }), 'Kaboom')
    expect(m).toMatchObject({ id: 'events:1', title: 'First event' })
    expect(m.description).toContain('Kaboom')
  })
  it('lists every rung passed, years first', () => {
    const ids = milestonesReached(stats({ games: 27, years: 2 })).map((m) => m.id)
    expect(ids).toEqual(['years:2', 'games:10', 'games:25'])
  })
})

describe('topMilestones', () => {
  it('keeps the highest rung of each kind', () => {
    const ids = topMilestones(stats({ games: 60, events: 4, teammates: 12 })).map((m) => m.id)
    expect(ids).toEqual(['games:50', 'events:3', 'teammates:10'])
  })
})

describe('nextMilestone', () => {
  it('picks the goal the player is proportionally closest to', () => {
    // games 45/50 (from 25: 80%) beats teammates 11/25 (from 10: 7%)
    const n = nextMilestone(stats({ games: 45, teammates: 11 }))!
    expect(n.milestone.id).toBe('games:50')
    expect(n.hint).toBe('5 more games to 50')
    expect(n.progress).toBeCloseTo(0.8)
  })
  it('singular wording', () => {
    expect(nextMilestone(stats({ sessions: 4 }))!.hint).toBe('1 more drop-in to 5')
  })
  it('skips kinds never started and the calendar', () => {
    expect(nextMilestone(stats({ years: 1 }))).toBeNull()
    expect(nextMilestone(EMPTY_MILESTONE_STATS)).toBeNull()
  })
  it('nothing left past the top of a ladder', () => {
    expect(nextMilestone(stats({ games: 900 }))).toBeNull()
  })
})

describe('milestonesToCelebrate', () => {
  const reached = milestonesReached(stats({ games: 60, events: 4, years: 3 }))
  it('a device that never saw any celebrates ONE, the most impressive', () => {
    // years 3 is rung 2 of 4 (0.25); games 50 is rung 3 of 6 (0.33); events 3 is rung 2 of 6 (0.17)
    expect(milestonesToCelebrate(reached, null).map((m) => m.id)).toEqual(['games:50'])
  })
  it('afterwards only new ones, one per kind', () => {
    const seen = new Set(['years:2', 'years:3', 'games:10', 'events:1', 'events:3'])
    // games 25 and 50 are both new → one moment, the bigger
    expect(milestonesToCelebrate(reached, seen).map((m) => m.id)).toEqual(['games:50'])
  })
  it('nothing new, nothing shown', () => {
    expect(milestonesToCelebrate(reached, new Set(reached.map((m) => m.id)))).toEqual([])
  })
})
