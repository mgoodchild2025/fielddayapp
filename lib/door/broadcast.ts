import { supabaseKeyHeaders } from '@/lib/supabase/key-headers'
/**
 * Server → displays over Supabase Realtime broadcast (topic `door:<channel_key>`),
 * through the REST endpoint: no long-lived socket in a route handler.
 *
 * Broadcasts are HINTS. Displays always re-read /state when one arrives (and
 * every 15 s), so a lost message costs seconds, never a missed visitor —
 * which is why this never throws and gives up after 2 s.
 */

export type DoorEvent =
  | { event: 'ring'; payload: { ringId: string; visitorName: string | null; createdAt: string } }
  | { event: 'ack'; payload: { ringId: string; acknowledgedAt: string; displayLabel: string | null } }
  | { event: 'armed'; payload: { isArmed: boolean } }
  | { event: 'station'; payload: { locationLabel: string | null } }
  | { event: 'display_joined'; payload: { label: string } }
  | { event: 'display_left'; payload: { label: string } }

export function doorTopic(channelKey: string): string {
  return `door:${channelKey}`
}

export async function broadcastDoor(channelKey: string, msg: DoorEvent): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { ...supabaseKeyHeaders(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ topic: doorTopic(channelKey), event: msg.event, payload: msg.payload, private: false }],
      }),
      signal: AbortSignal.timeout(2_000),
    })
    if (!res.ok) console.warn(`[door] broadcast ${msg.event} failed: ${res.status}`)
    return res.ok
  } catch (err) {
    console.warn(`[door] broadcast ${msg.event} failed:`, (err as Error).message)
    return false
  }
}
