import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { QRCodeCard } from '@/components/checkin/qr-code-display'
import Link from 'next/link'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, sport, season_start_date, event_type, checkin_enabled').eq('organization_id', org.id).eq('slug', slug).single(),
  ])

  // Verify-on-return fallback: if Stripe redirected back with a session_id but the
  // webhook hasn't fired yet (or isn't configured — common in sandbox), confirm the
  // payment directly so it doesn't sit "pending". Mirrors the team page fallback.
  if (sessionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pay } = await (db as any)
      .from('payments')
      .select('id, status, registration_id')
      .eq('organization_id', org.id)
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()

    if (pay && pay.status !== 'paid') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ps } = await (db as any)
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any).from('payments').update({
              status: 'paid',
              paid_at: paidAt,
              stripe_payment_intent_id: (session.payment_intent as string) ?? null,
            }).eq('id', pay.id)

            if (pay.registration_id) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (db as any).from('registrations').update({ status: 'active' }).eq('id', pay.registration_id)
            }

            const merchIds = (session.metadata?.merchOrderIds ?? '').split(',').filter(Boolean)
            if (merchIds.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (db as any).from('merchandise_orders').update({ status: 'paid' }).in('id', merchIds)
            }
          }
        } catch (err) {
          console.error('[register/success] session verify failed:', err)
        }
      }
    }
  }

  // Fetch the player's registration to get their check-in token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registration } = user && league
    ? await (db as any)
        .from('registrations')
        .select('checkin_token, status')
        .eq('league_id', league.id)
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const { data: profile } = user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (db as any).from('profiles').select('full_name').eq('id', user.id).single()
    : { data: null }

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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <div className="text-6xl mb-4">{sportEmoji}</div>
        <h1 className="text-3xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {isPending ? 'Almost There!' : 'You\'re Registered!'}
        </h1>
        <p className="mt-3 text-gray-600">
          {isPending
            ? <>Your spot in <strong>{league?.name}</strong> is reserved — your registration will be confirmed once payment is completed.</>
            : <>You&apos;re all set for <strong>{league?.name}</strong>.</>
          }
        </p>
        {league?.season_start_date && (
          <p className="mt-2 text-gray-500 text-sm">
            Season starts {new Date(league.season_start_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
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
            <p className="text-xs text-gray-400 mt-3">
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
      <Footer org={org} />
    </div>
  )
}
