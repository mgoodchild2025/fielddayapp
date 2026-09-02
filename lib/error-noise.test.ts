import { describe, it, expect } from 'vitest'
import { describeErrorPath, isBotRequestNoise } from './error-noise'

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
