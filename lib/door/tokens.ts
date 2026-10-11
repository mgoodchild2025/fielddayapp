import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Door Alert tokens and input hygiene (server only — node:crypto).
 *
 * Every token is 32 random bytes, base64url: never sequential, never derived
 * from an id. Display tokens and visitor keys are handed out once and stored
 * only as a SHA-256 hash; join tokens/codes are stored plainly because paired
 * displays and admins must be able to show them again.
 */

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tokens arrive in URLs; anything else is rejected before touching the DB. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function isTokenShaped(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** No 0/O or 1/I, so a code read off a card can be typed back without guessing. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const JOIN_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

export function generateJoinCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]
  return code
}

/** Typed codes: case-insensitive, spaces/dashes ignored. Null when it can't be a code. */
export function normalizeJoinCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return JOIN_CODE_RE.test(code) ? code : null
}

/** "K7MQ 4XRT" — how codes are printed and shown. */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`
}

/**
 * Free text from the public (visitor name, device label, location): trimmed,
 * control/format characters removed, whitespace collapsed, capped. Rendered as
 * text only, never HTML. Returns '' when nothing is left.
 */
export function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  const cleaned = input
    // C0/C1 controls, zero-width and bidi overrides.
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(cleaned).slice(0, max).join('').trim()
}

/** Salted so a stored hash can't be reversed by hashing the IPv4 space. */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}
