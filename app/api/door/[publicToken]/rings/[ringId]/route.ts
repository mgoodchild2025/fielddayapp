import { doorJson, doorNotFound } from '@/lib/door/http'
import { doorOrgId, ringStatusForVisitor, stationByPublicToken } from '@/lib/door/service'

/** The visitor's page polls this (with its visitor key) to learn someone is coming. */
export async function GET(request: Request, { params }: { params: Promise<{ publicToken: string; ringId: string }> }) {
  const { publicToken, ringId } = await params
  const orgId = await doorOrgId()
  if (!orgId) return doorNotFound()
  const station = await stationByPublicToken(orgId, publicToken)
  if (!station) return doorNotFound()
  const key = new URL(request.url).searchParams.get('k') ?? ''
  const status = await ringStatusForVisitor(station.id, ringId, key)
  return status ? doorJson(status) : doorNotFound()
}
