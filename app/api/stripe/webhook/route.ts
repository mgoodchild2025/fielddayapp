import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendRegistrationConfirmation, sendPaymentFailedEmail, sendAdminPaymentFailedAlert } from '@/actions/emails'
import { calendarSubscribeUrls, ensureCalendarToken } from '@/lib/calendar-feed'
import { buildCalendarCtaHtml } from '@/lib/email'
import { checkAndNotifyLowStock } from '@/actions/merchandise'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const orgId = request.headers.get('x-org-id')
  if (!orgId) return NextResponse.json({ error: 'Unknown org' }, { status: 400 })

  const supabase = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentSettings } = await (supabase as any)
    .from('org_payment_settings')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('organization_id', orgId)
    .single()

  if (!paymentSettings?.stripe_webhook_secret) {
    console.warn(`[webhook] org ${orgId} has no webhook secret configured`)
    return NextResponse.json({ received: true })
  }

  let event: Stripe.Event
  try {
    const stripe = new Stripe(paymentSettings.stripe_secret_key ?? 'sk_placeholder', {
      apiVersion: '2026-04-22.dahlia' as const,
    })
    event = stripe.webhooks.constructEvent(body, sig, paymentSettings.stripe_webhook_secret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { registrationId, userId, leagueId, teamId, paymentType } = session.metadata ?? {}

    // ── Team payment ──────────────────────────────────────────────────────
    if (paymentType === 'team' && teamId && leagueId) {
      // Mark payment paid
      await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent as string,
        })
        .eq('stripe_checkout_session_id', session.id)

      // Activate all pending registrations for active team members in this league
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('status', 'active')

      const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean) as string[]

      if (userIds.length > 0) {
        await supabase
          .from('registrations')
          .update({ status: 'active' })
          .eq('league_id', leagueId)
          .in('user_id', userIds)
          .in('status', ['pending', 'waitlisted'])
      }

      // Send confirmation to each member
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [{ data: league }, { data: org }, { data: teamRow }] = await Promise.all([
        (supabase as any).from('leagues').select('name, sport, event_type, checkin_enabled').eq('id', leagueId).single(),
        supabase.from('organizations').select('name, slug').eq('id', orgId).single(),
        // Fetch the team's calendar_token so we can send a team-specific calendar link
        (supabase as any).from('teams').select('calendar_token').eq('id', teamId).single(),
      ])

      if (userIds.length > 0 && league?.name) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('full_name, email')
          .in('id', userIds)

        // Fetch check-in tokens for email QR codes
        const { data: regs } = await supabase
          .from('registrations')
          .select('user_id, checkin_token' as never)
          .eq('league_id', leagueId)
          .in('user_id', userIds)

        const tokenByUserId = new Map<string, string>()
        for (const r of (regs ?? []) as unknown as Array<{ user_id: string; checkin_token: string }>) {
          if (r.checkin_token) tokenByUserId.set(r.user_id, r.checkin_token)
        }

        const origin = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const checkinActive = (league as { checkin_enabled?: boolean } | null)?.checkin_enabled === true

        // Team calendar CTA — players confirmed via team payment ARE on the team,
        // so the team-specific feed (their games only) is the right link here.
        const teamOrgSlug = (org as any)?.slug as string | undefined
        let teamCalendarCtaHtml: string | undefined
        if (teamId && teamOrgSlug) {
          const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
          const calHost = `${teamOrgSlug}.${platformDomain}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const calToken = await ensureCalendarToken(supabase as any, 'teams', teamId, (teamRow as any)?.calendar_token)
          if (calToken) {
            const { webcalUrl, googleUrl } = calendarSubscribeUrls(calHost, `/api/teams/${teamId}/calendar.ics?token=${calToken}`)
            teamCalendarCtaHtml = buildCalendarCtaHtml({
              webcalUrl, googleUrl,
              heading: 'Add your team schedule to your calendar',
              subtext: 'Stay in sync automatically as games are added or updated.',
            })
          }
        }

        for (const profile of profiles ?? []) {
          if (profile.email) {
            const token = tokenByUserId.get((profile as unknown as { id?: string }).id ?? '')
            const checkinUrl = (checkinActive && token) ? `${origin}/checkin/${token}` : null
            await sendRegistrationConfirmation({
              email: profile.email,
              name: profile.full_name,
              leagueName: league.name,
              orgName: org?.name ?? '',
              sport: (league as { sport?: string }).sport ?? null,
              eventType: (league as { event_type?: string }).event_type ?? null,
              checkinUrl,
              calendarCtaHtml: teamCalendarCtaHtml,
            })
          }
        }
      }

      return NextResponse.json({ received: true })
    }

    // ── Standalone shop payment ───────────────────────────────────────────
    if (paymentType === 'shop') {
      const { merchOrderIds: rawShopOrderIds } = session.metadata ?? {}
      const shopOrderIds = rawShopOrderIds?.split(',').filter(Boolean) ?? []
      if (shopOrderIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('merchandise_orders')
          .update({ status: 'paid' })
          .in('id', shopOrderIds)

        // Check and notify admins if any item/variant is now low on stock
        await checkAndNotifyLowStock(orgId, shopOrderIds)
      }

      // Empty the buyer's cart now that payment succeeded. Durable backstop for the
      // client-side clear on the success page (covers users who close the tab, and
      // avoids the purchased items lingering on next load).
      if (userId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('cart_items')
          .delete()
          .eq('user_id', userId)
          .eq('organization_id', orgId)
      }
      return NextResponse.json({ received: true })
    }

    // ── Per-player payment (existing flow) ──────────────────────────────
    if (registrationId && userId) {
      const { merchOrderIds: rawMerchOrderIds } = session.metadata ?? {}

      await Promise.all([
        supabase
          .from('payments')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq('stripe_checkout_session_id', session.id),
        supabase
          .from('registrations')
          .update({ status: 'active' })
          .eq('id', registrationId),
      ])

      // Mark merchandise orders as paid and link payment_id
      if (rawMerchOrderIds) {
        const orderIds = rawMerchOrderIds.split(',').filter(Boolean)
        if (orderIds.length > 0) {
          // Find the payment record we just updated to get its id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: paymentRecord } = await (supabase as any)
            .from('payments')
            .select('id')
            .eq('stripe_checkout_session_id', session.id)
            .single()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('merchandise_orders')
            .update({
              status: 'paid',
              payment_id: paymentRecord?.id ?? null,
            })
            .in('id', orderIds)

          // Check and notify admins if any item/variant is now low on stock
          await checkAndNotifyLowStock(orgId, orderIds)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [{ data: profile }, { data: league }, { data: org }, { data: reg }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', userId).single(),
        (supabase as any).from('leagues').select('id, name, slug, sport, event_type, checkin_enabled, payment_mode, price_cents, currency, calendar_token').eq('id', leagueId ?? '').single(),
        supabase.from('organizations').select('name, slug').eq('id', orgId).single(),
        (supabase as any).from('registrations').select('user_id, checkin_token').eq('id', registrationId).single(),
      ])

      if (profile?.email && league?.name) {
        const origin = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const token = (reg as unknown as { checkin_token?: string } | null)?.checkin_token
        const checkinEnabled = (league as { checkin_enabled?: boolean } | null)?.checkin_enabled === true
        const checkinUrl = (checkinEnabled && token) ? `${origin}/checkin/${token}` : null

        // Calendar CTA for pickup/drop-in only — for league/tournament events the
        // player hasn't joined a team yet, so the team calendar (sent in the
        // team-added / join-approved email) is more relevant.
        let calendarCtaHtml: string | undefined
        const eventType = (league as { event_type?: string } | null)?.event_type ?? ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leagueSlug = (league as any)?.slug as string | undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgSlug = (org as any)?.slug as string | undefined
        if (['pickup', 'drop_in'].includes(eventType) && leagueSlug && orgSlug) {
          const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
          const calHost = `${orgSlug}.${platformDomain}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const calToken = await ensureCalendarToken(supabase as any, 'leagues', leagueId ?? '', (league as any)?.calendar_token)
          if (calToken) {
            const { webcalUrl, googleUrl } = calendarSubscribeUrls(calHost, `/api/events/${leagueSlug}/calendar.ics?token=${calToken}`)
            calendarCtaHtml = buildCalendarCtaHtml({
              webcalUrl, googleUrl,
              subtext: 'Stay in sync automatically as games and sessions are added or updated.',  // team calendar
            })
          }
        }

        await sendRegistrationConfirmation({
          email: profile.email,
          name: profile.full_name,
          leagueName: league.name,
          orgName: org?.name ?? '',
          sport: (league as { sport?: string } | null)?.sport ?? null,
          eventType: (league as { event_type?: string } | null)?.event_type ?? null,
          checkinUrl,
          calendarCtaHtml,
        })
      }

      // ── Per-team captain paying via registration flow ──────────────────────
      // When an admin pre-assigns a captain and they pay via the registration
      // flow (per-player path), create a team payment record and activate all
      // team members' registrations — identical to what the team payment webhook
      // branch does, so the team page correctly shows payment as complete.
      const leaguePaymentMode = (league as { payment_mode?: string } | null)?.payment_mode
      if (leaguePaymentMode === 'per_team' && leagueId) {
        // Find the captain's team in this league
        const { data: leagueTeams } = await supabase
          .from('teams')
          .select('id')
          .eq('league_id', leagueId)
          .eq('organization_id', orgId)

        const leagueTeamIds = (leagueTeams ?? []).map((t) => t.id)

        if (leagueTeamIds.length > 0) {
          const { data: captainMembership } = await supabase
            .from('team_members')
            .select('team_id')
            .eq('user_id', userId ?? '')
            .eq('role', 'captain')
            .eq('status', 'active')
            .in('team_id', leagueTeamIds)
            .maybeSingle()

          if (captainMembership?.team_id) {
            const captainTeamId = captainMembership.team_id
            const leaguePriceCents = (league as { price_cents?: number } | null)?.price_cents ?? 0
            const leagueCurrency = (league as { currency?: string } | null)?.currency ?? 'cad'

            // Upsert team payment record so the team page shows payment as complete
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: existingTeamPay } = await (supabase as any)
              .from('payments')
              .select('id, status')
              .eq('team_id', captainTeamId)
              .eq('league_id', leagueId)
              .eq('payment_type', 'team')
              .maybeSingle()

            if (existingTeamPay && existingTeamPay.status !== 'paid') {
              await supabase.from('payments').update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: session.payment_intent as string,
              }).eq('id', existingTeamPay.id)
            } else if (!existingTeamPay) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from('payments').insert({
                organization_id: orgId,
                team_id: captainTeamId,
                league_id: leagueId,
                user_id: userId,
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent as string,
                amount_cents: leaguePriceCents,
                currency: leagueCurrency,
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_type: 'team',
              })
            }

            // Activate all active team members' registrations in this league
            const { data: teamMembers } = await supabase
              .from('team_members')
              .select('user_id')
              .eq('team_id', captainTeamId)
              .eq('status', 'active')

            const memberIds = (teamMembers ?? []).map((m) => m.user_id).filter(Boolean) as string[]
            if (memberIds.length > 0) {
              await supabase
                .from('registrations')
                .update({ status: 'active' })
                .eq('league_id', leagueId)
                .in('user_id', memberIds)
                .in('status', ['pending', 'waitlisted'])
            }
          }
        }
      }
    }
  }

  // ── Shop session expired or cancelled — restore reserved stock ───────────
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const { paymentType, merchOrderIds: rawIds } = session.metadata ?? {}

    if (paymentType === 'shop') {
      const orderIds = rawIds?.split(',').filter(Boolean) ?? []
      if (orderIds.length > 0) {
        // Fetch the pending orders so we know which variants to restore
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pendingOrders } = await (supabase as any)
          .from('merchandise_orders')
          .select('id, variant_id, quantity')
          .in('id', orderIds)
          .eq('status', 'pending')

        // Restore stock: for each variant, re-read current qty and add back
        for (const order of (pendingOrders ?? []) as { id: string; variant_id: string | null; quantity: number }[]) {
          if (!order.variant_id) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: variant } = await (supabase as any)
            .from('merchandise_variants')
            .select('stock_quantity')
            .eq('id', order.variant_id)
            .single()

          if (variant && variant.stock_quantity !== null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from('merchandise_variants')
              .update({ stock_quantity: variant.stock_quantity + order.quantity })
              .eq('id', order.variant_id)
          }
        }

        // Delete the abandoned pending orders (they were never paid)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('merchandise_orders')
          .delete()
          .in('id', orderIds)
          .eq('status', 'pending')
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    const md = pi.metadata ?? {}
    const { registrationId, userId, leagueId } = md
    const failOrgId = md.orgId || orgId

    if (registrationId) {
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', pi.id)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: league }, { data: profile }, { data: org }, { data: admins }] = await Promise.all([
      leagueId
        ? supabase.from('leagues').select('name').eq('id', leagueId).single()
        : Promise.resolve({ data: null }),
      userId
        ? supabase.from('profiles').select('full_name, email').eq('id', userId).single()
        : Promise.resolve({ data: null }),
      supabase.from('organizations').select('name').eq('id', failOrgId ?? '').single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('org_members')
        .select('user_id, profile:profiles!org_members_user_id_fkey(email, full_name)')
        .eq('organization_id', failOrgId ?? '')
        .in('role', ['org_admin', 'league_admin'])
        .eq('status', 'active'),
    ])

    const leagueName = (league as { name?: string } | null)?.name ?? 'an event'
    const playerName = (profile as { full_name?: string } | null)?.full_name ?? null
    const playerEmail = (profile as { email?: string } | null)?.email ?? null
    const amountLabel = pi.amount ? `$${(pi.amount / 100).toFixed(2)} ${(pi.currency ?? '').toUpperCase()}`.trim() : null

    // Notify the player (existing behaviour)
    if (playerEmail && (league as { name?: string } | null)?.name) {
      await sendPaymentFailedEmail({ email: playerEmail, name: playerName ?? '', leagueName })
    }

    // Notify org admins — in-app + email. Never let this break the webhook.
    try {
      // Respect the per-org toggle (default on when no settings row exists).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: notifSettings } = await (supabase as any)
        .from('org_notification_settings')
        .select('payment_failure_notifications_enabled')
        .eq('organization_id', failOrgId ?? '')
        .maybeSingle()
      const alertsEnabled = notifSettings?.payment_failure_notifications_enabled ?? true

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminRows = alertsEnabled ? ((admins ?? []) as Array<{ user_id: string; profile: any }>) : []
      const notifBody = `${playerName ?? 'A player'}'s payment for ${leagueName} failed${amountLabel ? ` (${amountLabel})` : ''}.`

      const notifRows = adminRows
        .filter((a) => a.user_id)
        .map((a) => ({
          organization_id: failOrgId,
          user_id: a.user_id,
          type: 'payment_failed',
          title: 'Payment failed',
          body: notifBody,
          data: { leagueId: leagueId ?? null, registrationId: registrationId ?? null, userId: userId ?? null },
        }))
      if (notifRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert(notifRows)
      }

      const adminEmails = adminRows.flatMap((a) => {
        const p = Array.isArray(a.profile) ? a.profile[0] : a.profile
        return p?.email ? [p.email as string] : []
      })
      if (adminEmails.length > 0) {
        const host = request.headers.get('host')
        const origin = host ? `https://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? '')
        await sendAdminPaymentFailedAlert({
          to: adminEmails,
          playerName,
          playerEmail,
          leagueName,
          amountLabel,
          orgName: (org as { name?: string } | null)?.name ?? '',
          adminUrl: `${origin}/admin/payments`,
        })
      }
    } catch (err) {
      console.error('[webhook] admin payment-failure notification failed:', err)
    }
  }

  return NextResponse.json({ received: true })
}
