'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isValidDeviceId, type ScoreboardPlatform } from '@/lib/scoreboard-device'

/**
 * Scoreboard adoption logging — anonymous, and deliberately unauthenticated:
 * the scoreboard is login-optional, so requiring a user would record only the
 * minority of sessions and understate reality.
 *
 * That makes this a public write path, so it is kept deliberately dull: a
 * validated 24-hex device id, a coarse platform bucket, a day, and a counter
 * that is capped. Nothing here identifies a person, and nothing a caller sends
 * is stored verbatim beyond the id they generated for themselves.
 */

const PLATFORMS: ScoreboardPlatform[] = ['ios', 'android', 'desktop', 'other']
/** Bounds how far a spammer (or a stuck loop) can inflate one device's day. */
const MAX_LAUNCHES_PER_DAY = 50

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Org when the scoreboard was opened on an org host; null on the platform apex. */
async function orgIdOrNull(): Promise<string | null> {
  const headersList = await headers()
  return headersList.get('x-org-id')
}

export async function logScoreboardLaunch(input: {
  deviceId: string
  standalone: boolean
  platform: ScoreboardPlatform
}): Promise<void> {
  try {
    if (!isValidDeviceId(input.deviceId)) return
    const platform: ScoreboardPlatform = PLATFORMS.includes(input.platform) ? input.platform : 'other'
    const standalone = input.standalone === true
    const day = today()
    const organizationId = await orgIdOrNull()

    const db = createServiceRoleClient()
    const { data: existing } = await db
      .from('scoreboard_launch_logs')
      .select('launches, standalone')
      .eq('device_id', input.deviceId)
      .eq('day', day)
      .maybeSingle()

    await db.from('scoreboard_launch_logs').upsert({
      device_id: input.deviceId,
      day,
      organization_id: organizationId,
      // A standalone launch on any visit that day is the signal that matters —
      // on iOS it's the only install evidence there is, so never let a later
      // browser-tab visit erase it.
      standalone: standalone || existing?.standalone === true,
      platform,
      launches: Math.min((existing?.launches ?? 0) + 1, MAX_LAUNCHES_PER_DAY),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'device_id,day' })
  } catch (err) {
    console.warn('[scoreboard-metrics] launch log failed:', err)
  }
}

/** The browser reported a completed install. Chrome/desktop only — iOS never fires it. */
export async function logScoreboardInstall(input: {
  deviceId: string
  platform: ScoreboardPlatform
}): Promise<void> {
  try {
    if (!isValidDeviceId(input.deviceId)) return
    const platform: ScoreboardPlatform = PLATFORMS.includes(input.platform) ? input.platform : 'other'
    const day = today()
    const organizationId = await orgIdOrNull()

    const db = createServiceRoleClient()
    const { data: existing } = await db
      .from('scoreboard_launch_logs')
      .select('launches, installed_at')
      .eq('device_id', input.deviceId)
      .eq('day', day)
      .maybeSingle()

    await db.from('scoreboard_launch_logs').upsert({
      device_id: input.deviceId,
      day,
      organization_id: organizationId,
      standalone: true,
      platform,
      launches: Math.max(existing?.launches ?? 1, 1),
      // First install wins: re-firing can't restamp the day.
      installed_at: existing?.installed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'device_id,day' })
  } catch (err) {
    console.warn('[scoreboard-metrics] install log failed:', err)
  }
}
