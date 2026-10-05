import { formatDateOnly, formatGameTime } from '@/lib/format-time'
import { headers } from 'next/headers'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { QRCodeCard } from '@/components/checkin/qr-code-display'
import { PendingPaymentNotice } from '@/components/payments/pending-payment-notice'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: "You're registered" }

export default async function RegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { slug } = await params
  const { session_id: sessionId } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: branding }, { data: league }] = await Promise.all([

    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),

    db.from('leagues').select('id, name, sport, season_start_date, event_type, checkin_enabled, payment_instructions').eq('organization_id', org.id).eq('slug', slug).single(),
  ])

  // Verify-on-return fallback: if Stripe redirected back with a session_id but the
  // webhook hasn't fired yet (or isn't configured — common in sandbox), confirm the
  // payment directly so it doesn't sit "pending". Mirrors the team page fallback.
  if (sessionId) {

    const { data: pay } = await db
      .from('payments')
      .select('id, status, registration_id')
      .eq('organization_id', org.id)
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()

    if (pay && pay.status !== 'paid') {

      const { data: ps } = await db
        .from('org_payment_settings')
        .select('stripe_secret_key')
        .eq('organization_id', org.id)
        .maybeSingle()

      if (ps?.stripe_secret_key) {
        try {
          const Stripe = (await import('stripe')).default
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const orgStripe = new Stripe(ps.stripe_secret_key, { apiVersion: '2026-04-22.dahlia' as any })
          const session = await orgStripe.checkout.sessions.retrieve(sessionId)
          if (session.payment_status === 'paid') {
            const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()

            await db.from('payments').update({
              status: 'paid',
              paid_at: paidAt,
              stripe_payment_intent_id: (session.payment_intent as string) ?? null,
            }).eq('id', pay.id)

            if (pay.registration_id) {

              await db.from('registrations').update({ status: 'active' }).eq('id', pay.registration_id)
            }

            const merchIds = (session.metadata?.merchOrderIds ?? '').split(',').filter(Boolean)
            if (merchIds.length > 0) {

              await db.from('merchandise_orders').update({ status: 'paid' }).in('id', merchIds)
            }
          }
        } catch (err) {
          console.error('[register/success] session verify failed:', err)
        }
      }
    }
  }

  // Fetch the player's registration to get their check-in token

  const { data: registration } = user && league
    ? await db
        .from('registrations')
        .select('checkin_token, status, session_id')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // Chose cash / e-transfer / cheque: the registration is already active, so
  // without this the page said "You're all set" and the payment instructions
  // (shown once, on the payment step) were gone.
  const { data: owed } = user && league
    ? await db
        .from('payments')
        .select('payment_method, amount_cents, currency')
        .eq('organization_id', org.id)
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        // 'other' = an event with no online payments: pay as the instructions say.
        .in('payment_method', ['cash', 'etransfer', 'cheque', 'other'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }
  const pendingPayment = owed
    ? { payment_method: owed.payment_method ?? 'cash', amount_cents: owed.amount_cents, currency: owed.currency }
    : null
  // Same instructions the payment step showed: the event's, else the org's.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paymentInstructions: string | null = ((league as any)?.payment_instructions as string | null)?.trim() || null
  if (pendingPayment && !paymentInstructions) {
    const { data: orgPay } = await db
      .from('org_payment_settings')
      .select('registration_manual_instructions')
      .eq('organization_id', org.id)
      .maybeSingle()
    paymentInstructions = orgPay?.registration_manual_instructions ?? null
  }

  const { data: profile } = user

    ? await db.from('profiles').select('full_name').eq('id', user.id).single()
    : { data: null }

  // A drop-in booking is for ONE session: say which, instead of the season's
  // start date (which was often weeks before the night they booked).
  const bookedSessionId = (registration as { session_id?: string | null } | null)?.session_id ?? null
  const [{ data: bookedSession }, timezone] = await Promise.all([
    bookedSessionId
      ? db.from('event_sessions').select('scheduled_at, location_override').eq('id', bookedSessionId).eq('organization_id', org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getOrgTimezone(org.id),
  ])
  const sessionWhen = bookedSession ? formatGameTime(bookedSession.scheduled_at, timezone) : null

  const SPORT_EMOJI: Record<string, string> = {
    volleyball: '🏐', beach_volleyball: '🏐', soccer: '⚽', basketball: '🏀',
    hockey: '🏒', baseball: '⚾', softball: '🥎', tennis: '🎾',
    pickleball: '🏓', badminton: '🏸', football: '🏈', flag_football: '🏈',
    ultimate_frisbee: '🥏', dodgeball: '🔴', kickball: '⚽', lacrosse: '🥍',
    rugby: '🏉', swimming: '🏊', golf: '⛳',
  }
  const sportEmoji = (league?.sport && SPORT_EMOJI[league.sport]) ?? '🎉'

  const host = headersList.get('host') ?? ''
  const protocol = headersList.get('x-forwarded-proto') ?? 'https'
  const checkinToken = registration?.checkin_token as string | null
  const checkinUrl = (checkinToken && league?.checkin_enabled === true) ? `${protocol}://${host}/checkin/${checkinToken}` : null

  // When arriving from Stripe (session_id present), the webhook may not have
  // fired yet. Treat registration as confirmed so "You're Registered!" is shown
  // instead of the misleading "Almost There!" holding message.
  const isPending = !sessionId && registration?.status === 'pending'

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
      <div className="fd-step-in max-w-lg mx-auto w-full px-6 py-16 text-center flex-1">
        <div className="text-6xl mb-4">{sportEmoji}</div>
        <h1 className="text-3xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {isPending ? 'Almost There!' : 'You\'re Registered!'}
        </h1>
        <p className="mt-3 text-gray-600">
          {isPending
            ? <>Your spot in <strong>{league?.name}</strong> is reserved — your registration will be confirmed once payment is completed.</>
            : pendingPayment
              ? <>Your spot in <strong>{league?.name}</strong> is reserved. Here&apos;s how to pay:</>
              : <>You&apos;re all set for <strong>{league?.name}</strong>.</>
          }
        </p>
        {pendingPayment && !isPending && (
          <PendingPaymentNotice
            className="mt-5"
            payment={pendingPayment}
            instructions={paymentInstructions}
          />
        )}
        {sessionWhen ? (
          <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-x-1.5 rounded-lg bg-white border px-4 py-2 text-sm text-gray-800">
            <span className="font-semibold">Your session:</span>
            <span>{sessionWhen.date} · {sessionWhen.time}</span>
            {bookedSession?.location_override && <span className="text-gray-500">· {bookedSession.location_override}</span>}
          </p>
        ) : league?.season_start_date && (
          <p className="mt-2 text-gray-500 text-sm">
            Season starts {formatDateOnly(league.season_start_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}

        {/* QR code — shown when registration is active */}
        {checkinUrl && !isPending && (
          <div className="mt-8">
            <p className="text-sm text-gray-500 mb-4">
              Show this QR code to the organizer at check-in.
            </p>
            <QRCodeCard
              checkinUrl={checkinUrl}
              playerName={profile?.full_name ?? ''}
              eventName={league?.name ?? ''}
            />
            <p className="text-xs text-gray-500 mt-3">
              You can also find this QR code under My Events at any time.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/my-events" className="px-6 py-2.5 rounded-md font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
            My Events
          </Link>
          <Link href={`/events/${slug}`} className="px-6 py-2.5 rounded-md font-semibold border text-gray-700 hover:bg-gray-50">
            View Event
          </Link>
        </div>
      </div>
      </main>
      <Footer org={org} />
    </div>
  )
}
