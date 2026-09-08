import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { buildPushPayload, shouldDropSubscription, type NotificationRow } from '@/lib/push-payload'

/**
 * Web Push delivery. Fan-out runs after every notifications insert
 * (lib/notify.ts) and is best-effort: it never throws, and when VAPID keys are
 * missing it is a no-op so bell/email/SMS keep working unchanged.
 *
 * Subscriptions are per-origin, so a row matches only when BOTH user and org
 * match the notification — a player installed on two org sites gets each
 * org's alerts on the right icon.
 */

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

let vapidReady: boolean | null = null

function configureVapid(): boolean {
  if (vapidReady !== null) return vapidReady
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    vapidReady = false
    return false
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:hello@fielddayapp.ca', publicKey, privateKey)
  vapidReady = true
  return true
}

export function pushConfigured(): boolean {
  return configureVapid()
}

/** Validate what the browser handed us before it touches the database. */
export function parseSubscription(input: unknown): PushSubscriptionInput | null {
  if (!input || typeof input !== 'object') return null
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = typeof s.endpoint === 'string' ? s.endpoint : ''
  const p256dh = typeof s.keys?.p256dh === 'string' ? s.keys.p256dh : ''
  const auth = typeof s.keys?.auth === 'string' ? s.keys.auth : ''
  if (!endpoint.startsWith('https://') || endpoint.length > 2000) return null
  if (!p256dh || p256dh.length > 300 || !auth || auth.length > 100) return null
  return { endpoint, keys: { p256dh, auth } }
}

/** Upsert by endpoint — re-syncing on launch just refreshes last_seen_at. */
export async function upsertPushSubscription(
  userId: string,
  orgId: string,
  sub: PushSubscriptionInput,
  userAgent: string | null,
): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()
  const { error } = await db.from('push_subscriptions').upsert({
    user_id: userId,
    organization_id: orgId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent?.slice(0, 300) ?? null,
    last_seen_at: new Date().toISOString(),
    failed_at: null,
  }, { onConflict: 'endpoint' })
  return { error: error?.message ?? null }
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  const db = createServiceRoleClient()
  await db.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
}

interface SubRow {
  id: string
  user_id: string
  organization_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Deliver freshly inserted notification rows to every matching device.
 * Fire-and-forget from the caller's point of view; all failures are logged.
 */
export async function fanOutPush(rows: NotificationRow[]): Promise<void> {
  try {
    if (rows.length === 0 || !configureVapid()) return
    const db = createServiceRoleClient()

    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const orgIds = [...new Set(rows.map((r) => r.organization_id))]

    const { data: subs, error } = await db
      .from('push_subscriptions')
      .select('id, user_id, organization_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .in('organization_id', orgIds)
    if (error || !subs || subs.length === 0) return

    // Badge = that user's unread count in that org, computed server-side so
    // several devices never drift apart.
    const targets = new Set(subs.map((s) => `${s.organization_id}:${s.user_id}`))
    const unread = new Map<string, number>()
    await Promise.all([...targets].map(async (key) => {
      const [orgId, userId] = key.split(':')
      const { count } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .eq('read', false)
      unread.set(key, count ?? 0)
    }))

    const dead: string[] = []
    const failed: string[] = []
    await Promise.all(rows.flatMap((row) => {
      const key = `${row.organization_id}:${row.user_id}`
      const payload = JSON.stringify(buildPushPayload(row, unread.get(key)))
      return (subs as SubRow[])
        .filter((s) => s.user_id === row.user_id && s.organization_id === row.organization_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: 3600, urgency: 'high' },
            )
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            if (shouldDropSubscription(status)) dead.push(s.id)
            else {
              failed.push(s.id)
              console.warn(`[push] delivery failed (${status ?? 'network'}) for subscription ${s.id}`)
            }
          }
        })
    }))

    if (dead.length > 0) await db.from('push_subscriptions').delete().in('id', dead)
    if (failed.length > 0) {
      await db.from('push_subscriptions').update({ failed_at: new Date().toISOString() }).in('id', failed)
    }
  } catch (err) {
    console.error('[push] fan-out failed:', err)
  }
}
