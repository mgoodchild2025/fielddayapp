import type { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Door Alert retention (PIPEDA: keep only what the ring log needs). Run by the
 * nightly data-retention job:
 *   - rings (visitor first names, IP hashes) older than 30 days are deleted;
 *   - displays not seen for 60 days are revoked, and their push subscriptions deleted;
 *   - join attempts older than 24 h are deleted.
 */
export const RING_RETENTION_DAYS = 30
export const DISPLAY_IDLE_DAYS = 60

export async function purgeDoorData(db: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  const ringsBefore = new Date(now - RING_RETENTION_DAYS * day).toISOString()
  const idleBefore = new Date(now - DISPLAY_IDLE_DAYS * day).toISOString()
  const attemptsBefore = new Date(now - day).toISOString()

  const { count: rings } = await db.from('door_rings').delete({ count: 'exact' }).lt('created_at', ringsBefore)

  // Never seen counts from pairing time.
  const { data: idle } = await db.from('door_displays').select('id')
    .is('revoked_at', null)
    .or(`last_seen_at.lt.${idleBefore},and(last_seen_at.is.null,created_at.lt.${idleBefore})`)
  const idleIds = (idle ?? []).map((d) => d.id)
  if (idleIds.length > 0) {
    await db.from('door_push_subscriptions').delete().in('display_id', idleIds)
    await db.from('door_displays').update({ revoked_at: new Date(now).toISOString() }).in('id', idleIds)
  }

  const { count: attempts } = await db.from('door_join_attempts').delete({ count: 'exact' }).lt('created_at', attemptsBefore)
  return `door: ${rings ?? 0} rings purged, ${idleIds.length} idle displays revoked, ${attempts ?? 0} join attempts purged`
}
