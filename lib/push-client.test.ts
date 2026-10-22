import { describe, expect, it, vi } from 'vitest'

vi.mock('@/actions/push', () => ({
  getVapidPublicKey: vi.fn(), removePushSubscription: vi.fn(), savePushSubscription: vi.fn(),
}))

import { ensureCurrentKey, subscriptionUsesKey } from './push-client'

// base64url of bytes [1,2,3] and [4,5,6]
const OLD_KEY = 'AQID'
const NEW_KEY = 'BAUG'
const bytes = (...b: number[]) => new Uint8Array(b).buffer

function fakeSub(endpoint: string, key: ArrayBuffer | null) {
  return {
    endpoint,
    options: { applicationServerKey: key },
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> }
}

function fakeReg(next: PushSubscription | Error) {
  const subscribe = vi.fn<(opts: PushSubscriptionOptionsInit) => Promise<PushSubscription>>(async () => { if (next instanceof Error) throw next; return next })
  return { reg: { pushManager: { subscribe } } as unknown as ServiceWorkerRegistration, subscribe }
}

describe('subscriptionUsesKey', () => {
  it('compares the subscribed key with the current one', () => {
    expect(subscriptionUsesKey(fakeSub('e', bytes(1, 2, 3)), OLD_KEY)).toBe(true)
    expect(subscriptionUsesKey(fakeSub('e', bytes(1, 2, 3)), NEW_KEY)).toBe(false)
    expect(subscriptionUsesKey(fakeSub('e', null), NEW_KEY)).toBeNull()
  })
})

describe('ensureCurrentKey', () => {
  it('leaves a subscription on the current key alone', async () => {
    const sub = fakeSub('https://push/old', bytes(4, 5, 6))
    const { reg, subscribe } = fakeReg(fakeSub('https://push/new', bytes(4, 5, 6)))
    expect(await ensureCurrentKey(reg, sub, NEW_KEY)).toEqual({ sub, replaced: null })
    expect(sub.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('re-subscribes with the new key after a rotation and reports the old endpoint', async () => {
    const sub = fakeSub('https://push/old', bytes(1, 2, 3))
    const fresh = fakeSub('https://push/new', bytes(4, 5, 6))
    const { reg, subscribe } = fakeReg(fresh)
    const result = await ensureCurrentKey(reg, sub, NEW_KEY)
    expect(sub.unsubscribe).toHaveBeenCalled()
    const sent = subscribe.mock.calls[0]?.[0].applicationServerKey as Uint8Array
    expect(Array.from(new Uint8Array(sent as unknown as ArrayBuffer))).toEqual([4, 5, 6])
    expect(result).toEqual({ sub: fresh, replaced: 'https://push/old' })
  })

  it('reports no subscription when re-subscribing fails, so the device shows alerts off', async () => {
    const sub = fakeSub('https://push/old', bytes(1, 2, 3))
    const { reg } = fakeReg(new Error('needs a gesture'))
    expect(await ensureCurrentKey(reg, sub, NEW_KEY)).toEqual({ sub: null, replaced: 'https://push/old' })
  })

  it('leaves it alone when the browser does not say which key it used', async () => {
    const sub = fakeSub('https://push/old', null)
    const { reg, subscribe } = fakeReg(fakeSub('x', null))
    expect((await ensureCurrentKey(reg, sub, NEW_KEY)).replaced).toBeNull()
    expect(subscribe).not.toHaveBeenCalled()
  })
})
