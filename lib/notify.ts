import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { fanOutPush } from '@/lib/push'
import type { NotificationRow } from '@/lib/push-payload'

export type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

/**
 * The one way to create in-app notifications. Inserts the rows (service role)
 * and then pushes them to any phones the recipients have installed the org
 * site on. Push is fire-and-forget so the caller's action returns as soon as
 * the rows exist; failures are logged by lib/push.ts, never thrown.
 *
 * Callers that previously did `db.from('notifications').insert(rows)` get the
 * same `{ error }` shape back.
 */
export async function createNotifications(
  input: NotificationInsert | NotificationInsert[],
): Promise<{ error: PostgrestError | null }> {
  const rows = Array.isArray(input) ? input : [input]
  if (rows.length === 0) return { error: null }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('notifications')
    .insert(rows)
    .select('id, organization_id, user_id, type, title, body, data')
  if (error) return { error }

  if (data && data.length > 0) void fanOutPush(data as NotificationRow[])
  return { error: null }
}
