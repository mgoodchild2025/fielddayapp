import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { GuestAccountClaim } from '@/components/registration/guest-account-claim'

export const dynamic = 'force-dynamic'

export default async function GuestRegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reg?: string; session_id?: string }>
}) {
  const { slug } = await params
  const { reg: regId, session_id: sessionId } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, { data: league }, { data: paySettings }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, sport, season_start_date, currency, payment_instructions').eq('organization_id', org.id).eq('slug', slug).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_payment_settings').select('registration_manual_instructions').eq('organization_id', org.id).maybeSingle(),
  ])

  // Load the guest registration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registration } = regId
    ? await (db as any)
        .from('registrations')
        .select('id, status, user_id, guest_email')
        .eq('id', regId)
        .eq('organization_id', org.id)
        .maybeSingle()
    : { data: null }

  // Verify-on-return: if Stripe redirected back before the webhook fired, confirm
  // the payment directly so the registration doesn't sit "pending".
  let status: string | null = registration?.status ?? null
  if (sessionId && registration && registration.status !== 'active') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pay } = await (db as any)
      .from('payments').select('id, status').eq('organization_id', org.id)
      .eq('stripe_checkout_session_id', sessionId).maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ps } = await (db as any)
      .from('org_payment_settings').select('stripe_secret_key').eq('organization_id', org.id).maybeSingle()

    if (pay && ps?.stripe_secret_key) {
      try {
        const Stripe = (await import('stripe')).default
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgStripe = new Stripe(ps.stripe_secret_key, { apiVersion: '2026-05-27.dahlia' as any })
        const checkout = await orgStripe.checkout.sessions.retrieve(sessionId)
        if (checkout.payment_status === 'paid') {
          const nowIso = new Date().toISOString()
          if (pay.status !== 'paid') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db as any).from('payments').update({
              status: 'paid', paid_at: nowIso,
              stripe_payment_intent_id: (checkout.payment_intent as string) ?? null,
            }).eq('id', pay.id)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from('registrations').update({ status: 'active' }).eq('id', registration.id)
          status = 'active'
        }
      } catch (err) {
        console.error('[guest-success] session verify failed:', err)
      }
    }
  }

  const SPORT_EMOJI: Record<string, string> = {
    volleyball: '🏐', beach_volleyball: '🏐', soccer: '⚽', basketball: '🏀',
    hockey: '🏒', baseball: '⚾', softball: '🥎', tennis: '🎾',
    pickleball: '🏓', badminton: '🏸', football: '🏈', flag_football: '🏈',
    ultimate_frisbee: '🥏', dodgeball: '🔴', kickball: '⚽', lacrosse: '🥍',
    rugby: '🏉', swimming: '🏊', golf: '⛳',
  }
  const sportEmoji = (league?.sport && SPORT_EMOJI[league.sport]) ?? '🎉'

  const isPending = status === 'pending'
  // Only offer account claim for a still-unclaimed guest registration with an email.
  const canClaim = !!registration && !registration.user_id && !!registration.guest_email

  // Pay-in-person balance: an unpaid (pending) payment on an active registration —
  // i.e. there's no online payment, so the player owes the organizer at the venue.
  let amountDueCents = 0
  if (registration && status === 'active') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendingPay } = await (db as any)
      .from('payments').select('amount_cents')
      .eq('registration_id', registration.id).eq('organization_id', org.id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    amountDueCents = pendingPay?.amount_cents ?? 0
  }
  const amountDueLabel = amountDueCents > 0
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: (league?.currency ?? 'cad').toUpperCase() }).format(amountDueCents / 100)
    : null
  const payInstructions: string | null = (league?.payment_instructions?.trim() || null) ?? (paySettings?.registration_manual_instructions ?? null)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-lg mx-auto w-full px-6 py-16 text-center flex-1">
        <div className="text-6xl mb-4">{sportEmoji}</div>
        <h1 className="text-3xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          {isPending ? 'Almost There!' : "You're Registered!"}
        </h1>
        <p className="mt-3 text-gray-600">
          {isPending
            ? <>Your spot in <strong>{league?.name}</strong> is reserved — it will be confirmed once payment is completed.</>
            : <>You&apos;re all set for <strong>{league?.name}</strong>. Show your name to the organizer at check-in.</>}
        </p>
        {league?.season_start_date && (
          <p className="mt-2 text-gray-500 text-sm">
            Starts {new Date(league.season_start_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}

        {amountDueLabel && (
          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-amber-900">Amount due: {amountDueLabel} — pay the organizer in person</p>
            {payInstructions
              ? <p className="text-sm text-amber-800 whitespace-pre-wrap mt-1">{payInstructions}</p>
              : <p className="text-sm text-amber-700 mt-1">Please bring payment to the venue. The organizer will mark it received.</p>}
          </div>
        )}

        {canClaim && !isPending && (
          <div className="mt-8">
            <GuestAccountClaim registrationId={registration!.id} guestEmail={registration!.guest_email} />
          </div>
        )}

        <div className="mt-8">
          <Link href={`/events/${slug}`} className="px-6 py-2.5 rounded-md font-semibold border text-gray-700 hover:bg-gray-50 inline-block">
            View Event
          </Link>
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
