import { describe, it, expect } from 'vitest'
import { buildPushPayload, notificationHref, shouldDropSubscription } from './push-payload'

const base = { id: 'n1', organization_id: 'o1', user_id: 'u1', type: 'schedule', title: 'Game moved', body: 'Court 2 at 8:15', data: null }

describe('notificationHref', () => {
  it('follows the same fields the bell renders', () => {
    expect(notificationHref({ href: '/admin/events/1/media' })).toBe('/admin/events/1/media')
    expect(notificationHref({ accept_url: '/invite/abc' })).toBe('/invite/abc')
    expect(notificationHref({ team_url: 'https://acme.fielddayapp.ca/teams/t1' })).toBe('https://acme.fielddayapp.ca/teams/t1')
  })

  it('refuses anything that is not a relative path or https URL', () => {
    expect(notificationHref({ href: 'javascript:alert(1)' })).toBe('/dashboard')
    expect(notificationHref({ href: 'http://evil.example' })).toBe('/dashboard')
    expect(notificationHref(null)).toBe('/dashboard')
    expect(notificationHref({ gameId: 'g1' })).toBe('/dashboard')
  })
})

describe('buildPushPayload', () => {
  it('carries title, body, tag and badge', () => {
    expect(buildPushPayload(base, 3)).toEqual({
      title: 'Game moved', body: 'Court 2 at 8:15', href: '/dashboard', tag: 'n1', badge: 3, type: 'schedule',
    })
  })

  it('omits the badge when unknown and truncates long text', () => {
    const p = buildPushPayload({ ...base, title: 'x'.repeat(300), body: 'y'.repeat(500) })
    expect(p).not.toHaveProperty('badge')
    expect(p.title.length).toBe(100)
    expect(p.body.length).toBe(200)
  })
})

describe('shouldDropSubscription', () => {
  it('drops only gone/not-found endpoints', () => {
    expect(shouldDropSubscription(410)).toBe(true)
    expect(shouldDropSubscription(404)).toBe(true)
    expect(shouldDropSubscription(429)).toBe(false)
    expect(shouldDropSubscription(500)).toBe(false)
    expect(shouldDropSubscription(undefined)).toBe(false)
  })
})
