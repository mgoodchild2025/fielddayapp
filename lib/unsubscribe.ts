import { createHmac, timingSafeEqual } from 'crypto'

/**
 * One-click unsubscribe tokens for commercial (CASL) emails/SMS.
 * Payload is base64url(`${orgId}.${userId}.${type}`) plus an HMAC signature.
 * No DB lookup needed to validate — the signature proves authenticity.
 */
export type UnsubType = 'marketing_email' | 'marketing_sms'

function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'fieldday-unsubscribe-fallback-secret'
  )
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function makeUnsubscribeToken(orgId: string, userId: string, type: UnsubType): string {
  const payload = b64url(`${orgId}.${userId}.${type}`)
  return `${payload}.${sign(payload)}`
}

export function verifyUnsubscribeToken(
  token: string
): { orgId: string; userId: string; type: UnsubType } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const [orgId, userId, type] = decoded.split('.')
  if (!orgId || !userId || (type !== 'marketing_email' && type !== 'marketing_sms')) return null
  return { orgId, userId, type }
}

export function unsubscribeUrl(origin: string, orgId: string, userId: string, type: UnsubType): string {
  const token = makeUnsubscribeToken(orgId, userId, type)
  return `${origin.replace(/\/$/, '')}/unsubscribe?token=${encodeURIComponent(token)}`
}

/**
 * Unsubscribe tokens for the event-interest ("notify me") list. These signups
 * may be non-users (no userId), so the token is keyed by the event_interest row
 * id instead of orgId/userId. Same HMAC scheme — no DB lookup to validate.
 */
export function makeInterestUnsubToken(interestId: string): string {
  const payload = b64url(`interest.${interestId}`)
  return `${payload}.${sign(payload)}`
}

export function verifyInterestUnsubToken(token: string): { interestId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const [tag, interestId] = decoded.split('.')
  if (tag !== 'interest' || !interestId) return null
  return { interestId }
}

export function interestUnsubscribeUrl(origin: string, interestId: string): string {
  const token = makeInterestUnsubToken(interestId)
  return `${origin.replace(/\/$/, '')}/unsubscribe/interest?token=${encodeURIComponent(token)}`
}
