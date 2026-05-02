import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminSessionsManager } from '@/components/sessions/admin-sessions-manager'

export default async function AdminSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: sessions }] = await Promise.all([
    db
      .from('leagues')
      .select('id, name, event_type')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select(`
        id, scheduled_at, duration_minutes, capacity,
        location_override, notes, status,
        registered:session_registrations(count)
      `)
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('scheduled_at', { ascending: true }),
  ])

  if (!league) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const et = (league as any).event_type
  if (et !== 'pickup' && et !== 'drop_in') {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-gray-500 text-sm">
        Sessions are only available for Pickup and Drop-in events.
      </div>
    )
  }

  const mapped = (sessions ?? []).map((s: {
    id: string
    scheduled_at: string
    duration_minutes: number
    capacity: number | null
    location_override: string | null
    notes: string | null
    status: string
    registered: { count: number }[]
  }) => ({
    id: s.id,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    capacity: s.capacity,
    location_override: s.location_override,
    notes: s.notes,
    status: s.status,
    registered_count: s.registered?.[0]?.count ?? 0,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Pickup sessions</strong> are individual play times for this event — no teams needed.
        Players registered for this event will see upcoming sessions in their dashboard.
        Use <strong>Repeat weekly</strong> when adding a session to bulk-create the full schedule at once.
      </div>
      <AdminSessionsManager leagueId={id} initialSessions={mapped} />
    </div>
  )
}
