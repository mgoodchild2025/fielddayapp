import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms } from '@/lib/twilio'
import { deliverAnnouncementEmails } from '@/actions/messages'

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceRoleClient()
  const resend = getResend()
  const now = new Date()
  const results: string[] = []

  // 1. Deliver scheduled announcements past their send time
  const { data: due } = await supabase
    .from('announcements')
    .select('id, organization_id, title, body, audience_type, league_id, team_id')
    .is('sent_at', null)
    .eq('email_sent', false)
    .lte('scheduled_for', now.toISOString())

  for (const ann of due ?? []) {
    await deliverAnnouncementEmails(ann.id, ann.organization_id, {
      title: ann.title,
      body: ann.body,
      audience_type: ann.audience_type ?? 'org',
      league_id: ann.league_id ?? undefined,
      team_id: ann.team_id ?? undefined,
    }).catch(e => results.push(`ann ${ann.id} error: ${e}`))

    await supabase
      .from('announcements')
      .update({ sent_at: now.toISOString() })
      .eq('id', ann.id)

    results.push(`delivered announcement ${ann.id}`)
  }

  // 2. Game reminders — email players 24h before game
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const { data: games } = await supabase
    .from('games')
    .select('id, organization_id, scheduled_at, home_team_id, away_team_id, venue_name, leagues(name)')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in24h.toISOString())
    .is('reminder_sent', null)

  for (const game of games ?? []) {
    const league = Array.isArray(game.leagues) ? game.leagues[0] : game.leagues
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean)
    if (teamIds.length === 0) continue

    const { data: members } = await supabase
      .from('team_players')
      .select('profiles(email, full_name)')
      .in('team_id', teamIds)
    const profiles = (members ?? [])
      .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
      .filter(p => p?.email)

    if (profiles.length) {
      const gameTime = new Date(game.scheduled_at).toLocaleString('en-CA', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      await resend.emails.send({
        from: FROM_EMAIL,
        to: profiles.map(p => p!.email!),
        subject: `Game reminder: ${league?.name ?? 'Your game'} tomorrow`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2>You have a game tomorrow!</h2>
          <p><strong>League:</strong> ${league?.name ?? 'Your league'}</p>
          <p><strong>Time:</strong> ${gameTime}</p>
          ${game.venue_name ? `<p><strong>Venue:</strong> ${game.venue_name}</p>` : ''}
        </div>`,
      }).catch(() => {})
    }

    await supabase.from('games').update({ reminder_sent: now.toISOString() }).eq('id', game.id)
    results.push(`game reminder ${game.id}`)
  }

  // 3. Payment reminders — overdue installments
  const { data: overdueInstallments } = await supabase
    .from('payment_plan_installments')
    .select('id, enrollment_id, amount_cents, due_date, payment_plan_enrollments(registration_id, organization_id)')
    .eq('status', 'pending')
    .is('reminder_sent', null)
    .lt('due_date', now.toISOString())

  for (const inst of overdueInstallments ?? []) {
    const enrollment = Array.isArray(inst.payment_plan_enrollments)
      ? inst.payment_plan_enrollments[0]
      : inst.payment_plan_enrollments
    if (!enrollment) continue

    const { data: reg } = await supabase
      .from('registrations')
      .select('profiles(email, full_name)')
      .eq('id', enrollment.registration_id)
      .single()

    const profile = reg ? (Array.isArray(reg.profiles) ? reg.profiles[0] : reg.profiles) : null
    if (!profile?.email) continue

    await resend.emails.send({
      from: FROM_EMAIL,
      to: profile.email,
      subject: 'Payment reminder — installment overdue',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2>Payment Reminder</h2>
        <p>Hi ${profile.full_name ?? 'there'},</p>
        <p>You have an overdue installment of <strong>$${(inst.amount_cents / 100).toFixed(2)} CAD</strong> due ${new Date(inst.due_date).toLocaleDateString('en-CA')}.</p>
        <p>Please log in to your account to complete your payment.</p>
      </div>`,
    }).catch(() => {})

    await supabase
      .from('payment_plan_installments')
      .update({ reminder_sent: now.toISOString() })
      .eq('id', inst.id)

    results.push(`payment reminder installment ${inst.id}`)
  }

  // 4. SMS game reminders — send 3h before game to opted-in players
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const { data: smsGames } = await supabase
    .from('games')
    .select('id, scheduled_at, home_team_id, away_team_id, venue_name, leagues(name)')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in3h.toISOString())
    .is('sms_reminder_sent', null)

  for (const game of smsGames ?? []) {
    const league = Array.isArray(game.leagues) ? game.leagues[0] : game.leagues
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean)
    if (teamIds.length === 0) continue

    const { data: members } = await supabase
      .from('team_players')
      .select('profiles(phone, sms_opted_in, full_name)')
      .in('team_id', teamIds)

    const players = (members ?? [])
      .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
      .filter(p => p?.phone && p?.sms_opted_in)

    const gameTime = new Date(game.scheduled_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
    for (const player of players) {
      await sendSms(
        player!.phone!,
        `Fieldday reminder: ${league?.name ?? 'Game'} today at ${gameTime}${game.venue_name ? ` · ${game.venue_name}` : ''}. Reply STOP to unsubscribe.`
      ).catch(() => {})
    }

    await supabase.from('games').update({ sms_reminder_sent: now.toISOString() }).eq('id', game.id)
    results.push(`sms reminder game ${game.id}`)
  }

  return NextResponse.json({ ok: true, processed: results })
}
