import { doorJson, doorNotFound } from '@/lib/door/http'
import { doorOrgId, stationByJoin } from '@/lib/door/service'

/** Station name for the join page behind the staff QR. */
export async function GET(_request: Request, { params }: { params: Promise<{ joinToken: string }> }) {
  const { joinToken } = await params
  const orgId = await doorOrgId()
  if (!orgId) return doorNotFound()
  const station = await stationByJoin(orgId, { joinToken })
  return station ? doorJson({ stationName: station.name }) : doorNotFound()
}
