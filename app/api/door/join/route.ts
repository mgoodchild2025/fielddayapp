import { doorJson, doorNotFound, readBody, tooMany } from '@/lib/door/http'
import {
  doorOrgId, ipHashOf, joinRetryAfter, NEW_DISPLAYS_PER_STATION_PER_HOUR, pairDisplay,
  recordJoinAttempt, stationByJoin, stationJoinsLastHour,
} from '@/lib/door/service'
import { sanitizeText } from '@/lib/door/tokens'

/**
 * Pair a device with the staff QR's token or the typed 8-character code. No
 * login by design; limited to 5 attempts per IP per 15 minutes (success or
 * failure) and 20 new displays per station per hour.
 */
export async function POST(request: Request) {
  const orgId = await doorOrgId()
  if (!orgId) return doorNotFound()

  const ipHash = ipHashOf(request)
  const wait = await joinRetryAfter(ipHash)
  if (wait > 0) return tooMany(wait)

  const body = await readBody(request)
  const label = sanitizeText(body.label, 40)
  if (!label) return doorJson({ error: 'label_required' }, 400)

  const station = await stationByJoin(orgId, { joinToken: body.joinToken, joinCode: body.joinCode })
  await recordJoinAttempt(ipHash, station?.id ?? null, !!station)
  // Unknown, rotated and other-org credentials all look the same.
  if (!station) return doorNotFound()
  if ((await stationJoinsLastHour(station.id)) >= NEW_DISPLAYS_PER_STATION_PER_HOUR) return tooMany(3600, 'station_limit')

  const { displayToken } = await pairDisplay(station, label, ipHash)
  return doorJson({ displayToken, displayUrl: `/door/display/${displayToken}`, stationName: station.name }, 201)
}
