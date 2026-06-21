import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { AdminSessionsManager } from '@/components/sessions/admin-sessions-manager'
import { DropinWalkupPayment } from '@/components/sessions/dropin-walkup-payment'
import { CopyLinkButton } from '@/components/sessions/copy-link-button'

export default async function AdminSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: sessions }, { data: branding }, { data: paySettings }] = await Promise.all([
    db
      .from('leagues')
      .select('id, name, slug, event_type, registration_mode, max_participants, drop_in_price_cents, price_cents, currency, pickup_join_policy, access_token')
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

  // Fetch per-session drop-in registrants from the registrations table, plus the
  // old-flow session_registrations, so each session row can list WHO registered
  // (not just a count). Two sources, deduped by user_id like the check-in page.
  type RosterEntry = { name: string; isGuest: boolean; payment: 'paid' | 'owed' | 'free' }
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)
  const dropInBySession = new Map<string, number>()
  const rosterBySession = new Map<string, RosterEntry[]>()
  if (sessionIds.length > 0) {
    try {
      // New flow: drop-in registrations carrying a session_id.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dropInRegs } = await (db as any)
        .from('registrations')
        .select(`
          id, session_id, user_id, guest_name,
          profile:profiles!registrations_user_id_fkey(full_name)
        `)
        .eq('league_id', id)
        .eq('organization_id', org.id)
        .eq('registration_type', 'drop_in')
        .eq('status', 'active')
        .in('session_id', sessionIds)

      // Old flow: session_registrations (join-button) with profile name.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sessionRegs } = await (db as any)
        .from('session_registrations')
        .select(`
          session_id, user_id,
          profile:profiles!session_registrations_user_id_fkey(full_name)
        `)
        .eq('organization_id', org.id)
        .eq('status', 'registered')
        .in('session_id', sessionIds)

      // Resolve payment status for the drop-in registrations in one query.
      const regIds = (dropInRegs ?? []).map((r: { id: string }) => r.id)
      const paymentByReg = new Map<string, 'paid' | 'owed'>()
      if (regIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pays } = await (db as any)
          .from('payments')
          .select('registration_id, status')
          .eq('organization_id', org.id)
          .in('registration_id', regIds)
        for (const p of (pays ?? [])) {
          if (!p.registration_id) continue
          const prev = paymentByReg.get(p.registration_id)
          // 'paid' wins; otherwise a pending payment means money is owed (e.g. pay in person).
          if (p.status === 'paid') paymentByReg.set(p.registration_id, 'paid')
          else if (p.status === 'pending' && prev !== 'paid') paymentByReg.set(p.registration_id, 'owed')
        }
      }

      // user_ids already covered by the new flow — avoid double-listing the same person.
      const dropInUserIds = new Set(
        (dropInRegs ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean),
      )

      const push = (sessionId: string, entry: RosterEntry) => {
        dropInBySession.set(sessionId, (dropInBySession.get(sessionId) ?? 0) + 1)
        const list = rosterBySession.get(sessionId) ?? []
        list.push(entry)
        rosterBySession.set(sessionId, list)
      }

      for (const r of (dropInRegs ?? [])) {
        if (!r.session_id) continue
        const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile
        push(r.session_id, {
          name: profile?.full_name ?? r.guest_name ?? 'Guest',
          isGuest: !r.user_id,
          payment: paymentByReg.get(r.id) ?? 'free',
        })
      }

      for (const sr of (sessionRegs ?? [])) {
        if (!sr.session_id || (sr.user_id && dropInUserIds.has(sr.user_id))) continue
        const profile = Array.isArray(sr.profile) ? sr.profile[0] : sr.profile
        push(sr.session_id, {
          name: profile?.full_name ?? 'Unknown',
          isGuest: false,
          payment: 'free',
        })
      }

      // Alphabetise each roster for a stable, scannable list.
      for (const list of rosterBySession.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name))
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
    roster: rosterBySession.get(s.id) ?? [],
  }))

  const sessionOptions = mapped.map((s: { id: string; scheduled_at: string }) => ({
    id: s.id,
    label: new Date(s.scheduled_at).toLocaleString('en-CA', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
    }),
  }))
  const priceLabel = `$${(dropinPriceCents / 100).toFixed(2)}`

  // The self-serve registration link the QR also encodes — shareable directly.
  // For a "Group link" event we append the access key so link-holders can register.
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joinPolicy: string = (league as any).pickup_join_policy ?? 'public'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessKey = joinPolicy === 'link' ? `&key=${(league as any).access_token}` : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registrationUrl = `https://${org.slug}.${platformDomain}/register/${(league as any).slug}?mode=drop_in${accessKey}`

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Pickup sessions</strong> are individual play times for this event — no teams needed.
        Players registered for this event will see upcoming sessions in their dashboard.
        Use <strong>Repeat weekly</strong> when adding a session to bulk-create the full schedule at once.
      </div>

      {joinPolicy === 'private' ? (
        <div className="rounded-lg border bg-white px-4 py-3 text-sm text-gray-600 flex flex-wrap items-center gap-2">
          <span>🔒 This event is <strong>invite only</strong> — registration is restricted to people you invite individually.</span>
          <Link href={`/admin/events/${id}/invites`} className="font-semibold hover:underline" style={{ color: 'var(--brand-primary)' }}>
            Manage invites →
          </Link>
        </div>
      ) : (
        <>
          {joinPolicy === 'link' && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
              🔗 <strong>Group link</strong> — only people with the link below can register. Share it with your group; it includes a private access key.
            </div>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <Link
              href={`/admin/events/${id}/sessions/qr`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold border text-gray-700 hover:bg-gray-50"
            >
              <QrCode className="w-4 h-4" /> Registration QR
            </Link>
            <CopyLinkButton url={registrationUrl} label="Copy registration link" />
            {showWalkup && (
              <DropinWalkupPayment orgId={org.id} leagueId={id} sessions={sessionOptions} priceLabel={priceLabel} />
            )}
          </div>
        </>
      )}
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
