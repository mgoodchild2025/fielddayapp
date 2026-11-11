import { describe, expect, it } from 'vitest'
import { metadataBelongsToOrg } from './webhook-scope'

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`

/** Fake service client: `rows[table][id] = organization_id`. */
function fakeDb(rows: Record<string, Record<string, string>>, opts: { failing?: string } = {}) {
  const asked: string[] = []
  const db = {
    from: (table: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          asked.push(table)
          if (opts.failing === table) return { data: null, error: { message: 'boom' } }
          return { data: ids.filter((i) => rows[table]?.[i]).map((i) => ({ id: i, organization_id: rows[table][i] })), error: null }
        },
      }),
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, asked }
}

describe('metadataBelongsToOrg', () => {
  it('passes an event with no ids', async () => {
    const { db, asked } = fakeDb({})
    expect(await metadataBelongsToOrg(db, ORG, { paymentType: 'shop' })).toBe(true)
    expect(await metadataBelongsToOrg(db, ORG, null)).toBe(true)
    expect(asked).toEqual([])
  })

  it("passes when every row is the org's own", async () => {
    const { db } = fakeDb({
      registrations: { [id(1)]: ORG }, leagues: { [id(2)]: ORG },
      merchandise_orders: { [id(3)]: ORG, [id(4)]: ORG },
    })
    expect(await metadataBelongsToOrg(db, ORG, {
      orgId: ORG, registrationId: id(1), leagueId: id(2), merchOrderIds: `${id(3)},${id(4)}`, userId: id(9),
    })).toBe(true)
  })

  it("refuses an event that names another org's row", async () => {
    const { db } = fakeDb({ registrations: { [id(1)]: OTHER }, leagues: { [id(2)]: ORG } })
    expect(await metadataBelongsToOrg(db, ORG, { registrationId: id(1), leagueId: id(2) })).toBe(false)
  })

  it('refuses when one order in a list is foreign', async () => {
    const { db } = fakeDb({ merchandise_orders: { [id(3)]: ORG, [id(4)]: OTHER } })
    expect(await metadataBelongsToOrg(db, ORG, { merchOrderIds: `${id(3)},${id(4)}` })).toBe(false)
  })

  it('refuses a metadata orgId that is not the host org', async () => {
    const { db } = fakeDb({})
    expect(await metadataBelongsToOrg(db, ORG, { orgId: OTHER })).toBe(false)
  })

  it('tolerates rows that no longer exist, and empty values', async () => {
    const { db } = fakeDb({})
    expect(await metadataBelongsToOrg(db, ORG, { registrationId: id(1), sessionId: '', paymentId: '' })).toBe(true)
  })

  it('refuses ids that are not UUIDs, and a failed lookup', async () => {
    expect(await metadataBelongsToOrg(fakeDb({}).db, ORG, { teamId: 'x) or (1=1' })).toBe(false)
    expect(await metadataBelongsToOrg(fakeDb({ teams: { [id(5)]: ORG } }, { failing: 'teams' }).db, ORG, { teamId: id(5) })).toBe(false)
  })
})
