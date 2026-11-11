import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tenant', () => ({ getCurrentOrg: vi.fn() }))
vi.mock('@/lib/org-cache', () => ({ getOrgBrandingCached: vi.fn() }))

import { pickTrustedOrigin } from './trusted-origin'

const base = { platformDomain: 'fielddayapp.ca', isDev: false, customDomain: null as string | null }

describe('pickTrustedOrigin', () => {
  it("uses the org's subdomain", () => {
    expect(pickTrustedOrigin({ ...base, host: 'kaboom.fielddayapp.ca', orgSlug: 'kaboom' })).toBe('https://kaboom.fielddayapp.ca')
  })

  it("keeps the org's custom domain, with or without www", () => {
    const org = { ...base, orgSlug: 'kaboom', customDomain: 'kaboomsports.com' }
    expect(pickTrustedOrigin({ ...org, host: 'kaboomsports.com' })).toBe('https://kaboomsports.com')
    expect(pickTrustedOrigin({ ...org, host: 'www.kaboomsports.com' })).toBe('https://www.kaboomsports.com')
    expect(pickTrustedOrigin({ ...org, customDomain: 'WWW.KaboomSports.com', host: 'kaboomsports.com' })).toBe('https://kaboomsports.com')
  })

  it('never follows a host that is not one of the org’s own', () => {
    const org = { ...base, orgSlug: 'kaboom', customDomain: 'kaboomsports.com' }
    for (const host of ['evil.example', 'kaboomsports.com.evil.example', 'evil.example:443', 'app.fielddayapp.ca', '', null]) {
      expect(pickTrustedOrigin({ ...org, host })).toBe('https://kaboom.fielddayapp.ca')
    }
  })

  it('falls back to the app host when there is no org', () => {
    expect(pickTrustedOrigin({ ...base, host: 'evil.example', orgSlug: null })).toBe('https://app.fielddayapp.ca')
    expect(pickTrustedOrigin({ ...base, host: 'fielddayapp.ca', orgSlug: null })).toBe('https://app.fielddayapp.ca')
  })

  it('uses localhost only in development', () => {
    expect(pickTrustedOrigin({ ...base, isDev: true, host: 'localhost:3000', orgSlug: 'kaboom' })).toBe('http://localhost:3000')
    expect(pickTrustedOrigin({ ...base, isDev: true, host: 'kaboom.localhost:3000', orgSlug: 'kaboom' })).toBe('http://kaboom.localhost:3000')
    expect(pickTrustedOrigin({ ...base, isDev: false, host: 'localhost:3000', orgSlug: 'kaboom' })).toBe('https://kaboom.fielddayapp.ca')
    expect(pickTrustedOrigin({ ...base, isDev: true, host: 'evil.example', orgSlug: 'kaboom' })).toBe('https://kaboom.fielddayapp.ca')
  })
})
