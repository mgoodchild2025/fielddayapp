import { broadcastDoor } from '@/lib/door/broadcast'
import { doorJson, readBody, withDisplay } from '@/lib/door/http'
import { sanitizeText } from '@/lib/door/tokens'
import { createServiceRoleClient } from '@/lib/supabase/service'

/** Tonight's location label ("Georgian College, east doors"); empty clears it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ station }) => {
    const body = await readBody(request)
    const locationLabel = sanitizeText(body.locationLabel, 80) || null
    const { error } = await createServiceRoleClient().from('door_stations')
      .update({ location_label: locationLabel, updated_at: new Date().toISOString() }).eq('id', station.id)
    if (error) return doorJson({ error: 'save_failed' }, 500)
    await broadcastDoor(station.channel_key, { event: 'station', payload: { locationLabel } })
    return doorJson({ locationLabel })
  })
}
