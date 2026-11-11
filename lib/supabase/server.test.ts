import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake Supabase client: counts getUser round trips, lets the test fire auth events.
type Listener = (event: string) => void
let calls = 0
let listeners: Listener[] = []
let userId = 'u1'
let factors: { id: string; status: string; factor_type: string }[] | undefined
let accessToken: string | null = null
let sessionReads = 0

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tokenWith = (aal: string) => `${b64url({ alg: 'HS256' })}.${b64url({ aal })}.sig`

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const auth = {
      getUser: async (jwt?: string) => {
        calls++
        if (jwt) return { data: { user: { id: `jwt:${jwt}` } }, error: null }
        return { data: { user: { id: userId, factors } }, error: null }
      },
      getSession: async () => {
        sessionReads++
        return { data: { session: accessToken ? { access_token: accessToken } : null }, error: null }
      },
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb)
        cb('INITIAL_SESSION') // supabase emits this to every new subscriber
        return { data: { subscription: { unsubscribe() {} } } }
      },
    }
    return { auth }
  },
}))

const fire = (event: string) => listeners.forEach((l) => l(event))

describe('createServerClient getUser memo', () => {
  beforeEach(() => { calls = 0; listeners = []; userId = 'u1'; factors = undefined; accessToken = null; sessionReads = 0; vi.resetModules() })

  it('shares one Auth round trip across repeated calls', async () => {
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    const [a, b] = await Promise.all([db.auth.getUser(), db.auth.getUser()])
    await db.auth.getUser()
    expect(calls).toBe(1)
    expect(a.data.user?.id).toBe('u1')
    expect(b.data.user?.id).toBe('u1')
  })

  it('INITIAL_SESSION / TOKEN_REFRESHED keep the memo', async () => {
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    await db.auth.getUser()
    fire('TOKEN_REFRESHED')
    await db.auth.getUser()
    expect(calls).toBe(1)
  })

  it('a sign-in or sign-out on the client clears it', async () => {
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    await db.auth.getUser()
    userId = 'u2'
    fire('SIGNED_IN')
    const after = await db.auth.getUser()
    expect(calls).toBe(2)
    expect(after.data.user?.id).toBe('u2')
    fire('SIGNED_OUT')
    await db.auth.getUser()
    expect(calls).toBe(3)
  })

  it('an explicit JWT is never memoised', async () => {
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    await db.auth.getUser('a')
    await db.auth.getUser('a')
    expect(calls).toBe(2)
  })
})

describe('createServerClient two-factor gate', () => {
  beforeEach(() => { calls = 0; listeners = []; userId = 'u1'; factors = undefined; accessToken = null; sessionReads = 0; vi.resetModules() })
  const totp = [{ id: 'f1', status: 'verified', factor_type: 'totp' }]

  it('a user without two-factor is untouched, and the token is never read', async () => {
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    expect((await db.auth.getUser()).data.user?.id).toBe('u1')
    expect(sessionReads).toBe(0)
  })

  it('an unfinished enrolment does not gate', async () => {
    factors = [{ id: 'f1', status: 'unverified', factor_type: 'totp' }]
    accessToken = tokenWith('aal1')
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    expect((await db.auth.getUser()).data.user?.id).toBe('u1')
  })

  it('a session that owes a code has no user — but the sign-in flow can still ask who is waiting', async () => {
    factors = totp
    accessToken = tokenWith('aal1')
    const { createServerClient, getUserBeforeMfa } = await import('./server')
    const db = await createServerClient()
    const res = await db.auth.getUser()
    expect(res.data.user).toBeNull()
    expect((res.error as { code?: string } | null)?.code).toBe('mfa_required')
    expect((await getUserBeforeMfa(db))?.id).toBe('u1')
    await db.auth.getUser()
    expect(calls).toBe(1) // still one Auth round trip for all of it
  })

  it('fails closed when an enrolled user has no readable token', async () => {
    factors = totp
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    expect((await db.auth.getUser()).data.user).toBeNull()
  })

  it('once the code is entered the user is back', async () => {
    factors = totp
    accessToken = tokenWith('aal1')
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    expect((await db.auth.getUser()).data.user).toBeNull()
    accessToken = tokenWith('aal2')
    fire('MFA_CHALLENGE_VERIFIED')
    expect((await db.auth.getUser()).data.user?.id).toBe('u1')
  })

  it('an aal2 session passes straight through', async () => {
    factors = totp
    accessToken = tokenWith('aal2')
    const { createServerClient } = await import('./server')
    const db = await createServerClient()
    expect((await db.auth.getUser()).data.user?.id).toBe('u1')
  })
})
