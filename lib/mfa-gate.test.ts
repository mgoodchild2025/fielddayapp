import { describe, expect, it } from 'vitest'
import { owesSecondFactor, tokenAal, verifiedFactors } from './mfa-gate'

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`

const enrolled = { factors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }] }

describe('tokenAal', () => {
  it('reads the aal claim', () => {
    expect(tokenAal(token({ aal: 'aal1' }))).toBe('aal1')
    expect(tokenAal(token({ aal: 'aal2', sub: 'u?~ü' }))).toBe('aal2')
  })
  it('is null for anything unreadable', () => {
    for (const t of [null, undefined, '', 'abc', 'a.b.c', token({}), token({ aal: 'aal3' })]) expect(tokenAal(t)).toBeNull()
  })
})

describe('owesSecondFactor', () => {
  it('never applies to a user without two-factor', () => {
    expect(owesSecondFactor(null, null)).toBe(false)
    expect(owesSecondFactor({}, token({ aal: 'aal1' }))).toBe(false)
    expect(owesSecondFactor({ factors: [] }, null)).toBe(false)
  })
  it('ignores an enrolment that was never finished', () => {
    const user = { factors: [{ id: 'f1', status: 'unverified' }] }
    expect(verifiedFactors(user)).toEqual([])
    expect(owesSecondFactor(user, token({ aal: 'aal1' }))).toBe(false)
  })
  it('applies until a code has been entered this session', () => {
    expect(owesSecondFactor(enrolled, token({ aal: 'aal1' }))).toBe(true)
    expect(owesSecondFactor(enrolled, token({ aal: 'aal2' }))).toBe(false)
  })
  it('fails closed for an enrolled user with an unreadable token', () => {
    expect(owesSecondFactor(enrolled, null)).toBe(true)
    expect(owesSecondFactor(enrolled, 'garbage')).toBe(true)
  })
})
