'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { broadcastDoor } from '@/lib/door/broadcast'
import { ipHashFromHeaders, newStationSecrets, pairDisplay, revokeDisplay } from '@/lib/door/service'
import { generateJoinCode, randomToken, sanitizeText } from '@/lib/door/tokens'

/**
 * Door Alert admin actions: org admins and league admins (decided for v1).
 * Every action resolves the org from the request, checks the caller's role
 * and the plan, and verifies the station belongs to the org before writing.
 */

const PATH = '/admin/settings/door-alert'

type Result<T = object> = ({ error?: undefined } & T) | { error: string }

async function guard(): Promise<{ orgId: string; userId: string } | { error: string }> {
  const org = await getCurrentOrg(await headers())
  const auth = await assertOrgAdmin(org)
  if (auth.error !== undefined) return { error: auth.error }
  if (!(await canAccess(org.id, 'door_alert'))) return { error: 'Door Alert isn’t included in your plan.' }
  return { orgId: org.id, userId: auth.userId }
}

async function ownStation(orgId: string, stationId: string) {
  if (!z.string().uuid().safeParse(stationId).success) return null
  const { data } = await createServiceRoleClient().from('door_stations').select('id, channel_key, name')
    .eq('id', stationId).eq('organization_id', orgId).maybeSingle()
  return data
}

const stationFields = z.object({
  name: z.string().transform((s) => sanitizeText(s, 60)).pipe(z.string().min(1, 'Give the door a name.')),
  cooldownSeconds: z.coerce.number().int().min(10, 'Cooldown is at least 10 seconds.').max(600, 'Cooldown is at most 10 minutes.'),
  fallbackMessage: z.string().transform((s) => sanitizeText(s, 200) || null).nullable(),
})

export async function createDoorStation(input: z.input<typeof stationFields>): Promise<Result<{ id: string }>> {
  const g = await guard()
  if ('error' in g) return g
  const parsed = stationFields.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const db = createServiceRoleClient()
  // join_code has ~10^12 values; a collision is astronomically rare, but retry once rather than fail.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db.from('door_stations').insert({
      organization_id: g.orgId,
      name: parsed.data.name,
      cooldown_seconds: parsed.data.cooldownSeconds,
      fallback_message: parsed.data.fallbackMessage,
      ...newStationSecrets(),
    }).select('id').single()
    if (data) {
      revalidatePath(PATH)
      return { id: data.id }
    }
    if (error?.code !== '23505') return { error: 'Couldn’t create the door.' }
  }
  return { error: 'Couldn’t create the door. Try again.' }
}

export async function updateDoorStation(stationId: string, input: z.input<typeof stationFields>): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  if (!(await ownStation(g.orgId, stationId))) return { error: 'Door not found.' }
  const parsed = stationFields.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { error } = await createServiceRoleClient().from('door_stations').update({
    name: parsed.data.name,
    cooldown_seconds: parsed.data.cooldownSeconds,
    fallback_message: parsed.data.fallbackMessage,
    updated_at: new Date().toISOString(),
  }).eq('id', stationId).eq('organization_id', g.orgId)
  if (error) return { error: 'Couldn’t save the door.' }
  revalidatePath(PATH)
  return {}
}

export async function setDoorStationArmed(stationId: string, armed: boolean): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  const station = await ownStation(g.orgId, stationId)
  if (!station) return { error: 'Door not found.' }
  const { error } = await createServiceRoleClient().from('door_stations')
    .update({ is_armed: armed === true, updated_at: new Date().toISOString() }).eq('id', stationId)
  if (error) return { error: 'Couldn’t change it.' }
  await broadcastDoor(station.channel_key, { event: 'armed', payload: { isArmed: armed === true } })
  revalidatePath(PATH)
  return {}
}

/** Revoke a paired device: its link stops working and its phones stop getting pushes. */
export async function revokeDoorDisplay(displayId: string): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  if (!z.string().uuid().safeParse(displayId).success) return { error: 'Device not found.' }
  const { data } = await createServiceRoleClient().from('door_displays')
    .select('id, label, station_id, door_stations!inner(channel_key)')
    .eq('id', displayId).eq('organization_id', g.orgId).is('revoked_at', null).maybeSingle()
  if (!data) return { error: 'Device not found.' }
  await revokeDisplay(data, data.door_stations as { channel_key: string })
  revalidatePath(PATH)
  return {}
}

/** New staff QR + code. Old cards stop working; paired devices stay paired. */
export async function rotateDoorJoinCredentials(stationId: string): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  if (!(await ownStation(g.orgId, stationId))) return { error: 'Door not found.' }
  const db = createServiceRoleClient()
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db.from('door_stations')
      .update({ join_token: randomToken(), join_code: generateJoinCode(), updated_at: new Date().toISOString() })
      .eq('id', stationId)
    if (!error) {
      revalidatePath(PATH)
      return {}
    }
    if (error.code !== '23505') break
  }
  return { error: 'Couldn’t issue a new code.' }
}

/** New visitor link. Printed door signs stop working. */
export async function regenerateDoorVisitorLink(stationId: string): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  if (!(await ownStation(g.orgId, stationId))) return { error: 'Door not found.' }
  const { error } = await createServiceRoleClient().from('door_stations')
    .update({ public_token: randomToken(), updated_at: new Date().toISOString() }).eq('id', stationId)
  if (error) return { error: 'Couldn’t make a new link.' }
  revalidatePath(PATH)
  return {}
}

/** Delete a door, its paired devices and its ring log. */
export async function deleteDoorStation(stationId: string): Promise<Result> {
  const g = await guard()
  if ('error' in g) return g
  const station = await ownStation(g.orgId, stationId)
  if (!station) return { error: 'Door not found.' }
  const db = createServiceRoleClient()
  // Tell open displays before the rows (and their tokens) disappear.
  await broadcastDoor(station.channel_key, { event: 'armed', payload: { isArmed: false } })
  const { error } = await db.from('door_stations').delete().eq('id', stationId).eq('organization_id', g.orgId)
  if (error) return { error: 'Couldn’t delete the door.' }
  revalidatePath(PATH)
  return {}
}

const DEVICE_KINDS = ['iPhone', 'iPad', 'Android phone', 'Android tablet', 'phone', 'tablet', 'computer'] as const

/**
 * "Alert me on this phone": pair the signed-in admin's own device as a display
 * for this door — no staff QR or code needed. Door alerts then reach them
 * through the Fieldday app's existing notifications (the root worker). The
 * token is returned once, like a normal pairing; the browser keeps it.
 */
export async function alertMeOnThisDevice(stationId: string, deviceKind: string): Promise<Result<{ displayToken: string; displayId: string; label: string }>> {
  const g = await guard()
  if ('error' in g) return g
  if (!z.string().uuid().safeParse(stationId).success) return { error: 'Door not found.' }
  const db = createServiceRoleClient()
  const [{ data: station }, { data: profile }] = await Promise.all([
    db.from('door_stations').select('*').eq('id', stationId).eq('organization_id', g.orgId).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', g.userId).maybeSingle(),
  ])
  if (!station) return { error: 'Door not found.' }
  const first = sanitizeText(profile?.full_name ?? '', 40).split(' ')[0] || 'Admin'
  const kind = (DEVICE_KINDS as readonly string[]).includes(deviceKind) ? deviceKind : 'phone'
  const label = sanitizeText(`${first}’s ${kind}`, 40)
  try {
    const { displayToken, displayId } = await pairDisplay(station, label, ipHashFromHeaders(await headers()))
    revalidatePath(PATH)
    return { displayToken, displayId, label }
  } catch {
    return { error: 'Couldn’t turn on door alerts. Try again.' }
  }
}
