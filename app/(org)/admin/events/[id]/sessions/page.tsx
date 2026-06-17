import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminSessionsManager } from '@/components/sessions/admin-sessions-manager'
import { DropinWalkupPayment } from '@/components/sessions/dropin-walkup-payment'

export default async function AdminSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: sessions }, { data: branding }, { data: paySettings }] = await Promise.all([
    db
      .from('leagues')
      .select('id, name, event_type, registration_mode, max_participants, drop_in_price_cents, price_cents, currency')
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
    db.from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_payment_settings').select('stripe_secret_key').eq('organization_id', org.id).maybeSingle(),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'

  // Walk-up payment is available when Stripe is connected and a drop-in price is set.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropinPriceCents: number = ((league as any)?.drop_in_price_cents ?? (league as any)?.price_cents ?? 0)
  const stripeConnected = !!paySettings?.stripe_secret_key
  const showWalkup = stripeConnected && dropinPriceCents > 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueAny = league as any
  const registrationMode: string = leagueAny?.registration_mode ?? 'season'
  const eventCapacity: number | null = leagueAny?.max_participants ?? null

  // For season-pass events, all sessions are attended by every registered player.
  // Count only season-type registrations (not drop-in rows which are per-session).
  let seasonRegistrantCount = 0
  if (registrationMode === 'season') {
    const { count } = await db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .or('registration_type.eq.season,registration_type.is.null')
    seasonRegistrantCount = count ?? 0
  }

  // Fetch per-session drop-in counts from the registrations table.
  // Drop-in players who registered through the registration flow have a session_id
  // on their registrations row — count them per session separately.
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)
  const dropInBySession = new Map<string, number>()
  if (sessionIds.length > 0) {
    try {
      const { data: dropInRegs } = await db
        .from('registrations')
        .select('session_id')
        .eq('league_id', id)
        .eq('organization_id', org.id)
        .eq('registration_type', 'drop_in')
        .eq('status', 'active')
        .in('session_id', sessionIds)
      for (const r of (dropInRegs ?? [])) {
        if (r.session_id) {
          dropInBySession.set(r.session_id, (dropInBySession.get(r.session_id) ?? 0) + 1)
        }
      }
    } catch {
      // session_id column not yet present — gracefully degrade
    }
  }

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
    dropin_count: dropInBySession.get(s.id) ?? 0,
  }))

  const sessionOptions = mapped.map((s: { id: string; scheduled_at: string }) => ({
    id: s.id,
    label: new Date(s.scheduled_at).toLocaleString('en-CA', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
    }),
  }))
  const priceLabel = `$${(dropinPriceCents / 100).toFixed(2)}`

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Pickup sessions</strong> are individual play times for this event — no teams needed.
        Players registered for this event will see upcoming sessions in their dashboard.
        Use <strong>Repeat weekly</strong> when adding a session to bulk-create the full schedule at once.
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Link
          href={`/admin/events/${id}/sessions/qr`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold border text-gray-700 hover:bg-gray-50"
        >
          <QrCode className="w-4 h-4" /> Registration QR
        </Link>
        {showWalkup && (
          <DropinWalkupPayment orgId={org.id} leagueId={id} sessions={sessionOptions} priceLabel={priceLabel} />
        )}
      </div>
      <AdminSessionsManager
        leagueId={id}
        initialSessions={mapped}
        timezone={timezone}
        registrationMode={registrationMode}
        seasonRegistrantCount={seasonRegistrantCount}
        eventCapacity={eventCapacity}
      />
    </div>
  )
}
