import { doorJson, doorNotFound, withDisplay } from '@/lib/door/http'
import { acknowledgeRing } from '@/lib/door/service'

/** ON MY WAY. Idempotent: the first ack wins and later ones get its time back. */
export async function POST(_request: Request, { params }: { params: Promise<{ displayToken: string; ringId: string }> }) {
  const { displayToken, ringId } = await params
  return withDisplay(displayToken, async ({ display, station }) => {
    const result = await acknowledgeRing(display, station, ringId)
    return result ? doorJson({ acknowledgedAt: result.acknowledgedAt }) : doorNotFound()
  })
}
