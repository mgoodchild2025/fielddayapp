import { describe, it, expect } from 'vitest'
import { nextSessionPerEvent, type SessionRow } from './next-sessions'

const NOW = '2026-09-22T12:00:00.000Z'
const s = (id: string, league: string, at: string, status?: string): SessionRow =>
  ({ id, scheduled_at: at, status, league: { id: league } })

describe('nextSessionPerEvent', () => {
  it('keeps one session per event — the soonest', () => {
    const out = nextSessionPerEvent([
      s('b2', 'beach', '2026-10-06T23:00:00.000Z'),
      s('b1', 'beach', '2026-09-29T23:00:00.000Z'),
    ], NOW)
    expect(out.map((x) => x.id)).toEqual(['b1'])
  })

  it('orders events by their next session, soonest first', () => {
    const out = nextSessionPerEvent([
      s('q1', 'queens', '2026-10-03T14:00:00.000Z'),
      s('b1', 'beach', '2026-09-29T23:00:00.000Z'),
      s('c1', 'coed', '2026-10-01T23:00:00.000Z'),
    ], NOW)
    expect(out.map((x) => x.league?.id)).toEqual(['beach', 'coed', 'queens'])
  })

  it('never offers a cancelled session, falling through to the next open one', () => {
    const out = nextSessionPerEvent([
      s('b1', 'beach', '2026-09-29T23:00:00.000Z', 'cancelled'),
      s('b2', 'beach', '2026-10-06T23:00:00.000Z', 'open'),
    ], NOW)
    expect(out.map((x) => x.id)).toEqual(['b2'])
  })

  it('drops an event whose only upcoming session was cancelled', () => {
    expect(nextSessionPerEvent([s('b1', 'beach', '2026-09-29T23:00:00.000Z', 'cancelled')], NOW)).toEqual([])
  })

  it('ignores sessions already started or past', () => {
    const out = nextSessionPerEvent([
      s('old', 'beach', '2026-09-15T23:00:00.000Z'),
      s('now', 'beach', NOW),
      s('next', 'beach', '2026-09-29T23:00:00.000Z'),
    ], NOW)
    expect(out.map((x) => x.id)).toEqual(['next'])
  })

  it('de-duplicates a session reached through more than one registration path', () => {
    const dup = s('b1', 'beach', '2026-09-29T23:00:00.000Z')
    expect(nextSessionPerEvent([dup, { ...dup }], NOW)).toHaveLength(1)
  })

  it('treats a missing status as open', () => {
    expect(nextSessionPerEvent([s('b1', 'beach', '2026-09-29T23:00:00.000Z')], NOW)).toHaveLength(1)
  })

  it('skips nulls and rows without an event', () => {
    const orphan = { id: 'x', scheduled_at: '2026-09-29T23:00:00.000Z', league: null }
    expect(nextSessionPerEvent([null, undefined, orphan], NOW)).toEqual([])
  })
})
