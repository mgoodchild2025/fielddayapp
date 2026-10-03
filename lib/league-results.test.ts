import { describe, expect, it } from 'vitest'
import { getLeagueConfirmedResults } from './league-results'

// Fake PostgREST builder: records filters and serves rows by range.
function fakeDb(total: number, opts: { error?: string } = {}) {
  const calls: { filters: [string, string, unknown][]; range: [number, number] }[] = []
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `r${i}`, home_score: i, away_score: 0, status: 'confirmed', sets: null, is_forfeit: false, forfeit_team_id: null,
    games: i % 2 ? [{ league_id: 'L1', home_team_id: 'a', away_team_id: 'b', status: 'completed', pool_id: null, scheduled_at: null, is_exhibition: false }]
                 : { league_id: 'L1', home_team_id: 'a', away_team_id: 'b', status: 'completed', pool_id: null, scheduled_at: null, is_exhibition: false },
  }))
  const db = {
    from: () => {
      const call = { filters: [] as [string, string, unknown][], range: [0, 0] as [number, number] }
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { call.filters.push(['eq', col, v]); return q },
        order: () => q,
        range: (a: number, b: number) => {
          call.range = [a, b]; calls.push(call)
          return Promise.resolve(opts.error
            ? { data: null, error: { message: opts.error } }
            : { data: rows.slice(a, b + 1), error: null })
        },
      }
      return q
    },
  }
  return { db: db as never, calls }
}

describe('getLeagueConfirmedResults', () => {
  it('filters by org, confirmed status and the league (in the database)', async () => {
    const { db, calls } = fakeDb(3)
    await getLeagueConfirmedResults(db, 'O1', 'L1')
    expect(calls[0].filters).toEqual([
      ['eq', 'organization_id', 'O1'],
      ['eq', 'status', 'confirmed'],
      ['eq', 'games.league_id', 'L1'],
    ])
  })

  it('flattens the joined game into `game`, array or object', async () => {
    const { db } = fakeDb(2)
    const rows = await getLeagueConfirmedResults(db, 'O1', 'L1')
    expect(rows.map((r) => r.game.league_id)).toEqual(['L1', 'L1'])
  })

  it('pages past the 1000-row cap and stops on a short page', async () => {
    const { db, calls } = fakeDb(2350)
    const rows = await getLeagueConfirmedResults(db, 'O1', 'L1')
    expect(rows).toHaveLength(2350)
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('an exact multiple of the page size costs one extra (empty) page, no more', async () => {
    const { db, calls } = fakeDb(1000)
    expect(await getLeagueConfirmedResults(db, 'O1', 'L1')).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it('throws on a query error instead of returning a partial table', async () => {
    const { db } = fakeDb(5, { error: 'boom' })
    await expect(getLeagueConfirmedResults(db, 'O1', 'L1')).rejects.toThrow('boom')
  })
})
