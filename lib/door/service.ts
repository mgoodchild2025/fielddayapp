import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { getClientIp } from '@/lib/rate-limit'
import type { Database } from '@/types/database'
import { broadcastDoor } from './broadcast'
import { sendDoorPush } from './push'
import { dueRenotifyStage, isLiveRing, RENOTIFY_AT_MS, type RingReason } from './logic'
import {
  generateJoinCode, hashIp, hashToken, hashesEqual, isTokenShaped, normalizeJoinCode, randomToken,
} from './tokens'

/**
 * Door Alert server core. Everything here runs with the service role, so every
 * lookup is scoped to the org the proxy resolved from the Host header: a token
 * from another org's station is simply "not found" (404, never 403 — no hint
 * that it exists). Only the /api/door/* route handlers and the admin actions
 * import this module.
 */

export type DoorStation = Database['public']['Tables']['door_stations']['Row']
export type DoorDisplay = Database['public']['Tables']['door_displays']['Row']
type DoorRing = Database['public']['Tables']['door_rings']['Row']

const db = () => createServiceRoleClient()

/** The request's org when Door Alert is on for it; null → every route answers 404. */
export async function doorOrgId(): Promise<string | null> {
  const orgId = (await headers()).get('x-org-id')
  if (!orgId) return null
  return (await canAccess(orgId, 'door_alert')) ? orgId : null
}

export function ipHashOf(request: Request): string {
  const salt = process.env.DOOR_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'fieldday-door'
  return hashIp(getClientIp(request), salt)
}

/** Absolute origin of this request (the org's own host), for links shown on displays. */
export function requestOrigin(request: Request): string {
  const h = request.headers
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(request.url).host
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export async function stationByPublicToken(orgId: string, token: string): Promise<DoorStation | null> {
  if (!isTokenShaped(token)) return null
  const { data } = await db().from('door_stations').select('*')
    .eq('public_token', token).eq('organization_id', orgId).maybeSingle()
  return data
}

export async function stationByJoin(
  orgId: string,
  cred: { joinToken?: unknown; joinCode?: unknown },
): Promise<DoorStation | null> {
  const q = db().from('door_stations').select('*').eq('organization_id', orgId)
  if (isTokenShaped(cred.joinToken)) {
    const { data } = await q.eq('join_token', cred.joinToken).maybeSingle()
    return data
  }
  const code = normalizeJoinCode(cred.joinCode)
  if (!code) return null
  const { data } = await q.eq('join_code', code).maybeSingle()
  return data
}

export type DisplayLookup =
  | { kind: 'ok'; display: DoorDisplay; station: DoorStation }
  | { kind: 'revoked' }
  | { kind: 'missing' }

export async function displayByToken(orgId: string, token: string): Promise<DisplayLookup> {
  if (!isTokenShaped(token)) return { kind: 'missing' }
  const hash = hashToken(token)
  const { data } = await db().from('door_displays').select('*, door_stations!inner(*)')
    .eq('token_hash', hash).eq('organization_id', orgId).maybeSingle()
  if (!data || !hashesEqual(data.token_hash, hash)) return { kind: 'missing' }
  if (data.revoked_at) return { kind: 'revoked' }
  const { door_stations: station, ...display } = data as DoorDisplay & { door_stations: DoorStation }
  return { kind: 'ok', display, station }
}

// ── Ringing ──────────────────────────────────────────────────────────────────

export type RingOutcome =
  | { ok: true; ringId: string; visitorKey: string; createdAt: string; cooldownSeconds: number }
  | { ok: false; reason: RingReason; retryAfter: number }

export async function ringStation(station: DoorStation, ipHash: string, visitorName: string): Promise<RingOutcome> {
  const visitorKey = randomToken()
  const { data, error } = await db().rpc('door_try_ring', {
    p_station_id: station.id,
    p_ip_hash: ipHash,
    p_name: visitorName,
    p_visitor_key_hash: hashToken(visitorKey),
  })
  if (error) throw new Error(`door_try_ring: ${error.message}`)
  const row = data?.[0]
  if (!row || row.reason || !row.ring_id || !row.created_at) {
    return { ok: false, reason: (row?.reason ?? 'not_found') as RingReason, retryAfter: row?.retry_after ?? 0 }
  }

  const ringId = row.ring_id
  const createdAt = row.created_at
  const name = visitorName || null
  // Displays first (fast path), then phones. The visitor's response waits at
  // most 2 s for push delivery; the rest finishes in the background.
  await broadcastDoor(station.channel_key, { event: 'ring', payload: { ringId, visitorName: name, createdAt } })
  const push = sendDoorPush({ stationId: station.id }, { type: 'ring', ringId, stationName: station.name, visitorName: name, createdAt })
  await Promise.race([push, new Promise((r) => setTimeout(r, 2_000))])
  scheduleRenotify(ringId)

  return { ok: true, ringId, visitorKey, createdAt, cooldownSeconds: station.cooldown_seconds }
}

/** Visitor polling: null unless the key matches (so ring ids alone reveal nothing). */
export async function ringStatusForVisitor(stationId: string, ringId: string, visitorKey: string) {
  if (!isTokenShaped(visitorKey) || !/^[0-9a-f-]{36}$/i.test(ringId)) return null
  const { data } = await db().from('door_rings').select('visitor_key_hash, acknowledged_at')
    .eq('id', ringId).eq('station_id', stationId).maybeSingle()
  if (!data || !hashesEqual(data.visitor_key_hash, hashToken(visitorKey))) return null
  return { status: data.acknowledged_at ? 'acknowledged' : 'pending', acknowledgedAt: data.acknowledged_at } as const
}

// ── Re-notify (60 s, 120 s) ──────────────────────────────────────────────────
// Railway cron can't run every 30 s, so the web server times its own
// re-notifies; the guarded UPDATE makes each stage send at most once, and the
// /state sweep catches anything a restart dropped.

async function renotifyIfDue(ring: Pick<DoorRing, 'id' | 'station_id' | 'created_at' | 'renotify_count' | 'acknowledged_at' | 'visitor_name'>, station: Pick<DoorStation, 'id' | 'name'>) {
  if (ring.acknowledged_at || !isLiveRing(ring, Date.now())) return
  const stage = dueRenotifyStage(Date.parse(ring.created_at), ring.renotify_count, Date.now())
  if (!stage) return
  const { data: claimed } = await db().from('door_rings').update({ renotify_count: stage })
    .eq('id', ring.id).is('acknowledged_at', null).lt('renotify_count', stage).select('id')
  if (!claimed || claimed.length === 0) return // acknowledged, or someone else sent it
  await sendDoorPush({ stationId: station.id }, {
    type: 'ring', ringId: ring.id, stationName: station.name, visitorName: ring.visitor_name, createdAt: ring.created_at, renotify: stage,
  })
}

function scheduleRenotify(ringId: string) {
  for (const at of RENOTIFY_AT_MS) {
    const t = setTimeout(async () => {
      try {
        const { data } = await db().from('door_rings')
          .select('id, station_id, created_at, renotify_count, acknowledged_at, visitor_name, door_stations!inner(id, name)')
          .eq('id', ringId).maybeSingle()
        if (data) await renotifyIfDue(data, data.door_stations as { id: string; name: string })
      } catch (err) {
        console.warn('[door] re-notify failed:', (err as Error).message)
      }
    }, at + 250)
    ;(t as { unref?: () => void }).unref?.()
  }
}

// ── Acknowledge ──────────────────────────────────────────────────────────────

/** First ack wins; later acks get the original time back. Null when the ring isn't this station's. */
export async function acknowledgeRing(display: DoorDisplay, station: DoorStation, ringId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ringId)) return null
  const now = new Date().toISOString()
  const { data: updated } = await db().from('door_rings')
    .update({ acknowledged_at: now, acknowledged_by_display_id: display.id })
    .eq('id', ringId).eq('station_id', station.id).is('acknowledged_at', null)
    .select('id, acknowledged_at')
  if (updated && updated.length > 0) {
    await broadcastDoor(station.channel_key, { event: 'ack', payload: { ringId, acknowledgedAt: now, displayLabel: display.label } })
    void sendDoorPush({ stationId: station.id }, { type: 'ack', ringId })
    return { acknowledgedAt: now, first: true }
  }
  const { data: existing } = await db().from('door_rings').select('acknowledged_at')
    .eq('id', ringId).eq('station_id', station.id).maybeSingle()
  if (!existing?.acknowledged_at) return null
  return { acknowledgedAt: existing.acknowledged_at, first: false }
}

// ── Display state ────────────────────────────────────────────────────────────

/** Screen mode counts as on while a display has polled with ?screen=1 recently. */
const SCREEN_FRESH_MS = 2 * 60_000

export async function displayState(display: DoorDisplay, station: DoorStation, opts: { screen: boolean }) {
  const client = db()
  const now = new Date()
  const nowIso = now.toISOString()
  const seen: Partial<DoorDisplay> = { last_seen_at: nowIso }
  if (opts.screen) seen.screen_armed_at = nowIso

  const [, ringsRes, lastRes, displaysRes, subsRes] = await Promise.all([
    client.from('door_displays').update(seen).eq('id', display.id),
    client.from('door_rings').select('id, station_id, visitor_name, created_at, acknowledged_at, renotify_count')
      .eq('station_id', station.id).is('acknowledged_at', null)
      .gte('created_at', new Date(now.getTime() - 30 * 60_000).toISOString())
      .order('created_at', { ascending: false }).limit(20),
    client.from('door_rings').select('visitor_name, created_at, acknowledged_at, door_displays(label)')
      .eq('station_id', station.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('door_displays').select('id, label, last_seen_at, screen_armed_at')
      .eq('station_id', station.id).is('revoked_at', null).order('created_at'),
    client.from('door_push_subscriptions').select('display_id').eq('station_id', station.id),
  ])

  const live = (ringsRes.data ?? []).filter((r) => isLiveRing(r, now.getTime()))
  // Sweep: any display polling is a chance to send a re-notify a restart lost.
  for (const r of live) void renotifyIfDue(r, station)

  const notifyIds = new Set((subsRes.data ?? []).map((s) => s.display_id))
  const last = lastRes.data as (typeof lastRes.data & { door_displays: { label: string } | null }) | null
  return {
    serverTime: nowIso,
    station: {
      name: station.name,
      locationLabel: station.location_label,
      isArmed: station.is_armed,
      channelKey: station.channel_key,
      cooldownSeconds: station.cooldown_seconds,
    },
    display: { id: display.id, label: display.label },
    rings: live.map((r) => ({ ringId: r.id, visitorName: r.visitor_name, createdAt: r.created_at })),
    lastRing: last ? {
      createdAt: last.created_at,
      visitorName: last.visitor_name,
      acknowledgedAt: last.acknowledged_at,
      acknowledgedBy: last.door_displays?.label ?? null,
    } : null,
    displays: (displaysRes.data ?? []).map((d) => {
      const screen = !!d.screen_armed_at && now.getTime() - Date.parse(d.screen_armed_at) < SCREEN_FRESH_MS
      const notify = notifyIds.has(d.id)
      return {
        label: d.label,
        mode: screen && notify ? 'both' : screen ? 'screen' : notify ? 'notify' : 'idle',
        lastSeenAt: d.id === display.id ? nowIso : d.last_seen_at,
        isYou: d.id === display.id,
      }
    }),
  }
}

// ── Pairing ──────────────────────────────────────────────────────────────────

export const JOIN_LIMIT_PER_IP = 5
export const JOIN_WINDOW_MS = 15 * 60_000
export const NEW_DISPLAYS_PER_STATION_PER_HOUR = 20

/** Seconds until this IP may try again, or 0. Counts successes and failures alike. */
export async function joinRetryAfter(ipHash: string): Promise<number> {
  const since = new Date(Date.now() - JOIN_WINDOW_MS).toISOString()
  const { data } = await db().from('door_join_attempts').select('created_at')
    .eq('ip_hash', ipHash).gte('created_at', since).order('created_at', { ascending: true }).limit(JOIN_LIMIT_PER_IP)
  if (!data || data.length < JOIN_LIMIT_PER_IP) return 0
  return Math.max(1, Math.ceil((Date.parse(data[0].created_at) + JOIN_WINDOW_MS - Date.now()) / 1000))
}

export async function recordJoinAttempt(ipHash: string, stationId: string | null, success: boolean) {
  await db().from('door_join_attempts').insert({ ip_hash: ipHash, station_id: stationId, success })
}

export async function stationJoinsLastHour(stationId: string): Promise<number> {
  const { count } = await db().from('door_displays').select('id', { count: 'exact', head: true })
    .eq('station_id', stationId).gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
  return count ?? 0
}

/** Creates the display; the returned token is never retrievable again. */
export async function pairDisplay(station: DoorStation, label: string, ipHash: string) {
  const token = randomToken()
  const { data, error } = await db().from('door_displays').insert({
    station_id: station.id,
    organization_id: station.organization_id,
    label,
    token_hash: hashToken(token),
    paired_ip_hash: ipHash,
  }).select('id').single()
  if (error || !data) throw new Error(`pair display: ${error?.message}`)
  await broadcastDoor(station.channel_key, { event: 'display_joined', payload: { label } })
  return { displayToken: token, displayId: data.id }
}

/** Leave / revoke: the token stops working and its phones stop getting pushes. */
export async function revokeDisplay(display: Pick<DoorDisplay, 'id' | 'label'>, station: Pick<DoorStation, 'channel_key'>) {
  const client = db()
  await Promise.all([
    client.from('door_displays').update({ revoked_at: new Date().toISOString() }).eq('id', display.id),
    client.from('door_push_subscriptions').delete().eq('display_id', display.id),
  ])
  await broadcastDoor(station.channel_key, { event: 'display_left', payload: { label: display.label } })
}

/** Fresh secrets for a new station, or to rotate them. */
export function newStationSecrets() {
  return { public_token: randomToken(), join_token: randomToken(), join_code: generateJoinCode(), channel_key: randomToken() }
}
