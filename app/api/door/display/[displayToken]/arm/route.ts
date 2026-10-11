import { broadcastDoor } from '@/lib/door/broadcast'
import { doorJson, readBody, withDisplay } from '@/lib/door/http'
import { createServiceRoleClient } from '@/lib/supabase/service'

/** Arm / disarm the whole station. Disarmed, the visitor page shows the fallback message. */
export async function POST(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ station }) => {
    const body = await readBody(request)
    if (typeof body.armed !== 'boolean') return doorJson({ error: 'armed_required' }, 400)
    const { error } = await createServiceRoleClient().from('door_stations')
      .update({ is_armed: body.armed, updated_at: new Date().toISOString() }).eq('id', station.id)
    if (error) return doorJson({ error: 'save_failed' }, 500)
    await broadcastDoor(station.channel_key, { event: 'armed', payload: { isArmed: body.armed } })
    return doorJson({ isArmed: body.armed })
  })
}
