import { describe, expect, it } from 'vitest'
import {
  formatJoinCode, generateJoinCode, hashIp, hashToken, hashesEqual, isTokenShaped,
  JOIN_CODE_ALPHABET, normalizeJoinCode, randomToken, sanitizeText,
} from './tokens'

describe('tokens', () => {
  it('are 32 random bytes in base64url and never repeat', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(a, 'base64url')).toHaveLength(32)
    expect(a).not.toBe(b)
    expect(isTokenShaped(a)).toBe(true)
  })

  it('rejects anything not token-shaped', () => {
    expect(isTokenShaped('short')).toBe(false)
    expect(isTokenShaped(randomToken() + 'x')).toBe(false)
    expect(isTokenShaped('a'.repeat(42) + '/')).toBe(false)
    expect(isTokenShaped(null)).toBe(false)
  })

  it('hash deterministically and compare in constant time', () => {
    const t = randomToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashesEqual(hashToken(t), hashToken(t))).toBe(true)
    expect(hashesEqual(hashToken(t), hashToken(randomToken()))).toBe(false)
    expect(hashesEqual(hashToken(t), 'abc')).toBe(false)
  })
})

describe('join codes', () => {
  it('use only the unambiguous alphabet', () => {
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01IO]/)
    expect(JOIN_CODE_ALPHABET).toHaveLength(32)
    for (let i = 0; i < 200; i++) expect(generateJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it('normalise typed input', () => {
    expect(normalizeJoinCode('k7mq4xrt')).toBe('K7MQ4XRT')
    expect(normalizeJoinCode(' K7MQ 4XRT ')).toBe('K7MQ4XRT')
    expect(normalizeJoinCode('K7MQ-4XRT')).toBe('K7MQ4XRT')
    expect(normalizeJoinCode('K7MQ4XR')).toBeNull()      // too short
    expect(normalizeJoinCode('K7MQ4XR0')).toBeNull()     // 0 is not in the alphabet
    expect(normalizeJoinCode('K7MQ4XRI')).toBeNull()     // nor I
    expect(normalizeJoinCode(42)).toBeNull()
  })

  it('print in two groups', () => {
    expect(formatJoinCode('K7MQ4XRT')).toBe('K7MQ 4XRT')
  })
})

describe('sanitizeText', () => {
  it('trims, collapses whitespace and caps length', () => {
    expect(sanitizeText('  Danny   B  ', 30)).toBe('Danny B')
    expect(sanitizeText('x'.repeat(50), 30)).toHaveLength(30)
  })

  it('strips control, zero-width and bidi characters', () => {
    expect(sanitizeText('Dan\u0000ny​', 30)).toBe('Dan ny')
    expect(sanitizeText('‮evil', 30)).toBe('evil')
    expect(sanitizeText('line\nbreak\ttab', 30)).toBe('line break tab')
  })

  it('counts characters, not UTF-16 units, and returns empty for junk', () => {
    expect(sanitizeText('😀'.repeat(40), 30)).toBe('😀'.repeat(30))
    expect(sanitizeText('   ', 30)).toBe('')
    expect(sanitizeText(undefined, 30)).toBe('')
    expect(sanitizeText({ name: 'x' }, 30)).toBe('')
  })

  it('leaves HTML as plain text (rendering escapes it)', () => {
    expect(sanitizeText('<b>Danny</b>', 30)).toBe('<b>Danny</b>')
  })
})

describe('hashIp', () => {
  it('depends on the salt and never contains the IP', () => {
    const a = hashIp('203.0.113.7', 'salt-a')
    expect(a).not.toContain('203')
    expect(a).not.toBe(hashIp('203.0.113.7', 'salt-b'))
    expect(a).toBe(hashIp('203.0.113.7', 'salt-a'))
  })
})
