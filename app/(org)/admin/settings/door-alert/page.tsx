import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { canAccess } from '@/lib/features'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { formatJoinCode } from '@/lib/door/tokens'
import { DoorAlertAdmin, type AdminStation, type AdminRing } from './door-alert-admin'

export const metadata: Metadata = { title: 'Door Alert' }

const SCREEN_FRESH_MS = 2 * 60_000

export default async function DoorAlertSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!(await canAccess(org.id, 'door_alert'))) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Door Alert</h1>
        <UpgradePrompt feature="Door Alert" requiredTier="starter" />
      </div>
    )
  }

  // Signs and cards use the host the admin is on (the org's own domain when it has one).
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? ''
  const origin = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
  const { stations, rings, timezone } = await loadDoorAdmin(org.id, origin)
  return <DoorAlertAdmin stations={stations} rings={rings} timezone={timezone} vapidKey={process.env.VAPID_PUBLIC_KEY ?? null} />
}

/** Everything the page shows, in one round of parallel reads. */
async function loadDoorAdmin(orgId: string, origin: string) {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [timezone, stationsRes, displaysRes, subsRes, ringsRes] = await Promise.all([
    getOrgTimezone(orgId),
    db.from('door_stations').select('id, name, location_label, public_token, join_token, join_code, is_armed, cooldown_seconds, fallback_message, created_at')
      .eq('organization_id', orgId).order('created_at'),
    db.from('door_displays').select('id, station_id, label, last_seen_at, screen_armed_at, created_at')
      .eq('organization_id', orgId).is('revoked_at', null).order('created_at'),
    db.from('door_push_subscriptions').select('display_id').eq('organization_id', orgId),
    db.from('door_rings').select('id, station_id, location_label, visitor_name, created_at, acknowledged_at, door_displays(label)')
      .eq('organization_id', orgId).gte('created_at', since).order('created_at', { ascending: false }).limit(300),
  ])

  const now = Date.now()
  const notify = new Set((subsRes.data ?? []).map((s) => s.display_id))

  const stations: AdminStation[] = (stationsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    locationLabel: s.location_label,
    isArmed: s.is_armed,
    cooldownSeconds: s.cooldown_seconds,
    fallbackMessage: s.fallback_message,
    visitorUrl: `${origin}/door/${s.public_token}`,
    joinUrl: `${origin}/door/join/${s.join_token}`,
    joinCode: formatJoinCode(s.join_code),
    displays: (displaysRes.data ?? []).filter((d) => d.station_id === s.id).map((d) => {
      const screen = !!d.screen_armed_at && now - Date.parse(d.screen_armed_at) < SCREEN_FRESH_MS
      const push = notify.has(d.id)
      return {
        id: d.id,
        label: d.label,
        mode: screen && push ? 'Screen + notifications' : screen ? 'Screen' : push ? 'Notifications' : 'Not alerting',
        lastSeenAt: d.last_seen_at ?? d.created_at,
      }
    }),
  }))

  const stationName = new Map(stations.map((s) => [s.id, s.name]))
  const rings: AdminRing[] = (ringsRes.data ?? []).map((r) => {
    const ackBy = (r as { door_displays: { label: string } | null }).door_displays
    return {
      id: r.id,
      stationName: stationName.get(r.station_id) ?? '',
      locationLabel: r.location_label,
      visitorName: r.visitor_name,
      createdAt: r.created_at,
      acknowledgedBy: ackBy?.label ?? null,
      responseSeconds: r.acknowledged_at ? Math.max(0, Math.round((Date.parse(r.acknowledged_at) - Date.parse(r.created_at)) / 1000)) : null,
    }
  })

  return { stations, rings, timezone }
}
