import { describe, it, expect } from 'vitest'
import { classifyNoise, describeErrorPath, isBotRequestNoise, isDeploymentSkew } from './error-noise'

describe('isBotRequestNoise', () => {
  it('flags a malformed multipart POST that landed on the not-found route', () => {
    expect(
      isBotRequestNoise('Failed to parse body as FormData.', { routePath: '/_not-found/page' }),
    ).toBe(true)
  })

  it('accepts the older undici wording and the Server Actions guard', () => {
    expect(isBotRequestNoise('Could not parse content as FormData.', { routePath: '/_not-found/page' })).toBe(true)
    expect(isBotRequestNoise('Invalid Server Actions request.', { routePath: '/_not-found/page' })).toBe(true)
  })

  it('does not flag a body-parse failure on a real page — that could be our bug', () => {
    expect(isBotRequestNoise('Failed to parse body as FormData.', { routePath: '/admin/leagues/[id]/page' })).toBe(false)
    expect(isBotRequestNoise('Failed to parse body as FormData.', {})).toBe(false)
  })

  it('does not flag other errors on the not-found route', () => {
    expect(isBotRequestNoise("Cannot read properties of null (reading 'id')", { routePath: '/_not-found/page' })).toBe(false)
  })
})

describe('deployment skew', () => {
  const msg = 'Failed to find Server Action. This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'

  it('flags a stale-tab action call on any page, not just not-found', () => {
    expect(isDeploymentSkew(msg)).toBe(true)
    expect(classifyNoise(msg, { routePath: '/(org)/(public)/page' })).toBe('deploy-skew')
  })

  it('does not swallow other action failures', () => {
    expect(isDeploymentSkew('Not authenticated')).toBe(false)
    expect(classifyNoise("Cannot read properties of null (reading 'id')", { routePath: '/(org)/(public)/page' })).toBeNull()
  })

  it('classifies bot noise ahead of skew', () => {
    expect(classifyNoise('Failed to parse body as FormData.', { routePath: '/_not-found/page' })).toBe('bot-request')
  })
})

describe('describeErrorPath', () => {
  it('prefers the requested URL and keeps the matched route when they differ', () => {
    expect(describeErrorPath('/wp-admin/admin-ajax.php', '/_not-found/page')).toBe(
      '/wp-admin/admin-ajax.php (/_not-found/page)',
    )
  })

  it('collapses identical values and falls back to whichever is present', () => {
    expect(describeErrorPath('/schedule', '/schedule')).toBe('/schedule')
    expect(describeErrorPath(undefined, '/admin/page')).toBe('/admin/page')
    expect(describeErrorPath('/x', undefined)).toBe('/x')
    expect(describeErrorPath(undefined, undefined)).toBeNull()
  })

  it('caps very long scanner URLs', () => {
    const long = '/' + 'a'.repeat(1000)
    expect(describeErrorPath(long, '/_not-found/page')!.length).toBeLessThan(330)
  })
})
