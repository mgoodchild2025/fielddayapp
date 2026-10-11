import { NextResponse } from 'next/server'
import { displayByToken, doorOrgId, type DoorDisplay, type DoorStation } from './service'

/** Door responses carry tokens and live state: never cached, never indexed. */
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export function doorJson(body: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...HEADERS, ...extra } })
}

export const doorNotFound = () => doorJson({ error: 'not_found' }, 404)

export function tooMany(retryAfter: number, error = 'rate_limited') {
  return doorJson({ error, retryAfter }, 429, { 'Retry-After': String(retryAfter) })
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * Resolve a display token for this org: 404 when unknown (or the feature is
 * off), 410 `{ revoked: true }` when it was revoked so the page can say
 * "This display has been disconnected".
 */
export async function withDisplay(
  displayToken: string,
  run: (ctx: { orgId: string; display: DoorDisplay; station: DoorStation }) => Promise<Response>,
): Promise<Response> {
  const orgId = await doorOrgId()
  if (!orgId) return doorNotFound()
  const found = await displayByToken(orgId, displayToken)
  if (found.kind === 'missing') return doorNotFound()
  if (found.kind === 'revoked') return doorJson({ error: 'revoked', revoked: true }, 410)
  return run({ orgId, display: found.display, station: found.station })
}
