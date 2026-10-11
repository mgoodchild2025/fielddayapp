import { doorJson, readBody, withDisplay } from '@/lib/door/http'
import { parseSubscription } from '@/lib/push'
import { createServiceRoleClient } from '@/lib/supabase/service'

/** Notify mode: save this browser's push subscription for the display. */
export async function POST(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ display, station }) => {
    const body = await readBody(request)
    const sub = parseSubscription(body.subscription)
    if (!sub) return doorJson({ error: 'invalid_subscription' }, 400)
    const ua = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : null
    // Upsert by endpoint: a browser re-pairing to another display moves with it.
    const { error } = await createServiceRoleClient().from('door_push_subscriptions').upsert({
      display_id: display.id,
      station_id: station.id,
      organization_id: station.organization_id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: ua,
      last_failure_at: null,
    }, { onConflict: 'endpoint' })
    if (error) return doorJson({ error: 'save_failed' }, 500)
    return doorJson({ ok: true }, 201)
  })
}

/** Turn notifications off on this browser. */
export async function DELETE(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ display }) => {
    const body = await readBody(request)
    if (typeof body.endpoint !== 'string') return doorJson({ error: 'endpoint_required' }, 400)
    await createServiceRoleClient().from('door_push_subscriptions')
      .delete().eq('display_id', display.id).eq('endpoint', body.endpoint)
    return doorJson({ ok: true })
  })
}
