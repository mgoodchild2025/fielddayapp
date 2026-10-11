import { doorJson, withDisplay } from '@/lib/door/http'
import { sendDoorPush } from '@/lib/door/push'

/** TEST ALERT: a push to this display's own subscriptions only (the screen alert is local). */
export async function POST(_request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ display, station }) => {
    await sendDoorPush({ displayId: display.id }, { type: 'test', stationId: station.id, stationName: station.name })
    return doorJson({ ok: true })
  })
}
