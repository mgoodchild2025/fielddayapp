import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake Supabase client: counts getUser round trips, lets the test fire auth events.
type Listener = (event: string) => void
let calls = 0
let listeners: Listener[] = []
let userId = 'u1'

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const auth = {
      getUser: async (jwt?: string) => {
        calls++
        if (jwt) return { data: { user: { id: `jwt:${jwt}` } }, error: null }
        return { data: { user: { id: userId } }, error: null }
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
  beforeEach(() => { calls = 0; listeners = []; userId = 'u1'; vi.resetModules() })

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
