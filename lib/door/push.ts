import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { pushConfigured } from '@/lib/push'
import { shouldDropSubscription } from '@/lib/push-payload'

/**
 * Notify-mode delivery for Door Alert. Same VAPID keys as the player alerts
 * (lib/push.ts) — never generate new ones: that would silently break every
 * existing subscription. Never throws.
 */

export type DoorPushPayload =
  | { type: 'ring'; ringId: string; stationName: string; visitorName: string | null; createdAt: string; renotify?: number }
  | { type: 'ack'; ringId: string }
  | { type: 'test'; stationName: string }

interface Target { stationId?: string; displayId?: string }

export async function sendDoorPush(target: Target, payload: DoorPushPayload): Promise<void> {
  try {
    if (!pushConfigured()) return
    if (!target.stationId && !target.displayId) return
    const db = createServiceRoleClient()
    let q = db.from('door_push_subscriptions').select('id, endpoint, p256dh, auth')
    if (target.displayId) q = q.eq('display_id', target.displayId)
    else q = q.eq('station_id', target.stationId!)
    const { data: subs } = await q
    if (!subs || subs.length === 0) return

    const body = JSON.stringify(payload)
    // A ring is worthless once the visitor has left; an ack must arrive fast
    // enough to close the notification while it still matters.
    const options = { TTL: payload.type === 'ring' ? 120 : 60, urgency: 'high' as const }
    const dead: string[] = []
    const ok: string[] = []
    const failed: string[] = []
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options)
        ok.push(s.id)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (shouldDropSubscription(status)) dead.push(s.id)
        else {
          failed.push(s.id)
          console.warn(`[door] push failed (${status ?? 'network'}) for subscription ${s.id}`)
        }
      }
    }))
    const now = new Date().toISOString()
    await Promise.all([
      dead.length ? db.from('door_push_subscriptions').delete().in('id', dead) : null,
      ok.length ? db.from('door_push_subscriptions').update({ last_success_at: now }).in('id', ok) : null,
      failed.length ? db.from('door_push_subscriptions').update({ last_failure_at: now }).in('id', failed) : null,
    ])
  } catch (err) {
    console.error('[door] push fan-out failed:', err)
  }
}
