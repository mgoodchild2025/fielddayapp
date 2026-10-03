import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/lib/tax', () => ({ getOrgTaxRates: async () => [] }))

import { cached, invalidateOrgCache, invalidateGlobalCache, clearOrgCache } from './org-cache'

afterEach(() => { clearOrgCache(); vi.useRealTimers() })

describe('org cache', () => {
  it('shares one in-flight load between concurrent callers', async () => {
    const load = vi.fn(async () => 'v')
    const [a, b] = await Promise.all([cached('k:o1', 1000, load), cached('k:o1', 1000, load)])
    expect(a).toBe('v'); expect(b).toBe('v')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads after the TTL', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => 'v')
    await cached('k:o1', 1000, load)
    vi.advanceTimersByTime(999)
    await cached('k:o1', 1000, load)
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    await cached('k:o1', 1000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('never caches a failure', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('ok')
    await expect(cached('k:o1', 1000, load)).rejects.toThrow('network')
    await expect(cached('k:o1', 1000, load)).resolves.toBe('ok')
  })

  it('invalidates one org without touching others or global entries', async () => {
    const load = vi.fn(async () => 'v')
    await cached('branding:o1', 1000, load)
    await cached('branding:o2', 1000, load)
    await cached('global:maintenance', 1000, load)
    invalidateOrgCache('o1')
    await cached('branding:o1', 1000, load) // reloads
    await cached('branding:o2', 1000, load) // still cached
    await cached('global:maintenance', 1000, load) // still cached
    expect(load).toHaveBeenCalledTimes(4)
    invalidateGlobalCache()
    await cached('global:maintenance', 1000, load)
    expect(load).toHaveBeenCalledTimes(5)
  })
})
