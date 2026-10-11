import { doorJson, withDisplay } from '@/lib/door/http'
import { revokeDisplay } from '@/lib/door/service'

/** LEAVE: unpair this device and delete its push subscriptions. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ display, station }) => {
    await revokeDisplay(display, station)
    return doorJson({ ok: true })
  })
}
