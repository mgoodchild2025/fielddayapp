import { doorJson, doorNotFound, readBody } from '@/lib/door/http'
import { ringRefusal } from '@/lib/door/logic'
import { doorOrgId, ipHashOf, ringStation, stationByPublicToken } from '@/lib/door/service'
import { sanitizeText } from '@/lib/door/tokens'

/** Visitor taps RING. Public: rate limits live in door_try_ring. */
export async function POST(request: Request, { params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params
  const orgId = await doorOrgId()
  if (!orgId) return doorNotFound()
  const station = await stationByPublicToken(orgId, publicToken)
  if (!station) return doorNotFound()

  const body = await readBody(request)
  const name = sanitizeText(body.name, 30)
  const outcome = await ringStation(station, ipHashOf(request), name)
  if (!outcome.ok) {
    const { status, body: refusal } = ringRefusal(outcome.reason, outcome.retryAfter, station.fallback_message)
    return doorJson(refusal, status, status === 429 ? { 'Retry-After': String(refusal.retryAfter) } : undefined)
  }
  return doorJson({ ringId: outcome.ringId, visitorKey: outcome.visitorKey, cooldownSeconds: outcome.cooldownSeconds }, 201)
}
