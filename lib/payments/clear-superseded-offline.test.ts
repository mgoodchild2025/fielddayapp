import { describe, expect, it } from 'vitest'
import { clearSupersededOfflinePayments, OFFLINE_METHODS } from './clear-superseded-offline'

// Records the PostgREST filter chain the helper builds.
function fakeDb() {
  const calls: [string, ...unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['delete', 'eq', 'in', 'or']) {
    chain[m] = (...args: unknown[]) => { calls.push([m, ...args]); return chain }
  }
  chain.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
  const db = { from: (t: string) => { calls.push(['from', t]); return chain } }
  return { db: db as never, calls }
}

describe('clearSupersededOfflinePayments', () => {
  it('deletes only this registration’s pending pay-later rows, never team fees', async () => {
    const { db, calls } = fakeDb()
    await clearSupersededOfflinePayments(db, 'org-1', 'reg-1')
    expect(calls).toEqual([
      ['from', 'payments'],
      ['delete'],
      ['eq', 'organization_id', 'org-1'],
      ['eq', 'registration_id', 'reg-1'],
      ['eq', 'status', 'pending'],
      ['in', 'payment_method', [...OFFLINE_METHODS]],
      ['or', 'payment_type.is.null,payment_type.neq.team'],
    ])
  })
})
