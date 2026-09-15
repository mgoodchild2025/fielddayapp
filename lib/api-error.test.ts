import { describe, it, expect } from 'vitest'
import { buildApiError, apiError, API_ERROR_STATUS, type ApiErrorCode } from './api-error'

const ALL_CODES = Object.keys(API_ERROR_STATUS) as ApiErrorCode[]

describe('buildApiError', () => {
  it('returns the mapped status for every code', () => {
    expect(buildApiError('not_found', 'x').status).toBe(404)
    expect(buildApiError('unauthorized', 'x').status).toBe(401)
    expect(buildApiError('rate_limited', 'x').status).toBe(429)
    expect(buildApiError('internal_error', 'x').status).toBe(500)
  })

  it('gives every code a code, message, hint, status and documentation link', () => {
    for (const code of ALL_CODES) {
      const { body } = buildApiError(code, `failed: ${code}`)
      expect(body.error.code).toBe(code)
      expect(body.error.message).toBe(`failed: ${code}`)
      expect(body.error.status).toBe(API_ERROR_STATUS[code])
      // A hint is what makes the error actionable for an agent — never blank.
      expect(body.error.hint.length).toBeGreaterThan(10)
      expect(body.error.documentation).toMatch(/^https:\/\//)
    }
  })

  it('prefers a caller-supplied hint over the default', () => {
    const { body } = buildApiError('bad_request', 'Missing league id', { hint: 'Pass ?league=<uuid>.' })
    expect(body.error.hint).toBe('Pass ?league=<uuid>.')
  })

  it('omits details unless given, and passes them through when present', () => {
    expect(buildApiError('bad_request', 'x').body.error.details).toBeUndefined()
    const { body } = buildApiError('bad_request', 'x', { details: { field: 'email' } })
    expect(body.error.details).toEqual({ field: 'email' })
  })

  it('body is JSON-serializable with no undefined leaves', () => {
    const { body } = buildApiError('forbidden', 'nope')
    expect(JSON.parse(JSON.stringify(body))).toEqual(body)
  })
})

describe('apiError response', () => {
  it('sends JSON content type, the mapped status, and no-store', async () => {
    const res = apiError('not_found', 'No such endpoint')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const parsed = await res.json()
    expect(parsed.error.code).toBe('not_found')
    expect(parsed.error.message).toBe('No such endpoint')
  })

  it('is parseable as JSON for every code', async () => {
    for (const code of ALL_CODES) {
      const parsed = await apiError(code, 'msg').json()
      expect(parsed.error.status).toBe(API_ERROR_STATUS[code])
    }
  })
})
