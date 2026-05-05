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
      .from('team_members')
      .select('profiles!team_members_user_id_fkey(email, full_name)')
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

  // 4. SMS game reminders — multi-reminder system using org_sms_reminders + game_sms_reminder_logs

  type ReminderConfig = { organization_id: string; minutes_before: number; message_template: string }
  type NotifSetting = { organization_id: string; sms_game_reminders_enabled: boolean }
  type GameRow = {
    id: string; organization_id: string; scheduled_at: string
    home_team_id: string | null; away_team_id: string | null; venue_name: string | null
    leagues: { name: string; organizations: { name: string } | { name: string }[] | null } | null
  }
  type LogRow = { game_id: string; minutes_before: number }

  // Fetch all enabled reminder configs and master toggles
  const [{ data: reminderConfigs }, { data: notifSettings }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_sms_reminders')
      .select('organization_id, minutes_before, message_template')
      .eq('enabled', true) as Promise<{ data: ReminderConfig[] | null }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_notification_settings')
      .select('organization_id, sms_game_reminders_enabled') as Promise<{ data: NotifSetting[] | null }>,
  ])

  // Orgs that have SMS reminders disabled
  const disabledOrgs = new Set(
    (notifSettings ?? []).filter(s => !s.sms_game_reminders_enabled).map(s => s.organization_id)
  )

  // Group reminder configs by org
  const remindersByOrg = new Map<string, ReminderConfig[]>()
  for (const r of reminderConfigs ?? []) {
    if (!remindersByOrg.has(r.organization_id)) remindersByOrg.set(r.organization_id, [])
    remindersByOrg.get(r.organization_id)!.push(r)
  }

  // No reminders configured anywhere — skip all the game queries
  if (remindersByOrg.size > 0) {
    // Fetch all upcoming games in the next 24h (widest possible reminder window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: smsGames } = await (supabase as any)
      .from('games')
      .select('id, organization_id, scheduled_at, home_team_id, away_team_id, venue_name, leagues(name, organizations(name))')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in24h.toISOString()) as { data: GameRow[] | null }

    const gameIds = (smsGames ?? []).map(g => g.id)

    // Fetch already-sent logs for these games
    const { data: sentLogs } = gameIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (supabase as any)
          .from('game_sms_reminder_logs')
          .select('game_id, minutes_before')
          .in('game_id', gameIds) as { data: LogRow[] | null }
      : { data: [] as LogRow[] }

    const sentSet = new Set((sentLogs ?? []).map(l => `${l.game_id}:${l.minutes_before}`))

    for (const game of smsGames ?? []) {
      const orgId = game.organization_id
      if (disabledOrgs.has(orgId)) continue

      const orgReminders = remindersByOrg.get(orgId)
      if (!orgReminders || orgReminders.length === 0) continue

      const msUntilGame = new Date(game.scheduled_at).getTime() - now.getTime()

      // Resolve org/league names once per game
      const league = game.leagues
      const leagueOrg = league
        ? (Array.isArray((league as { organizations?: unknown }).organizations)
            ? (league as { organizations: { name: string }[] }).organizations[0]
            : (league as { organizations?: { name: string } }).organizations)
        : null
      const orgName = leagueOrg?.name ?? 'Fieldday'
      const leagueName = league?.name ?? 'Game'
      const gameTime = new Date(game.scheduled_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
      const venue = game.venue_name ? ` · ${game.venue_name}` : ''

      for (const reminder of orgReminders) {
        const logKey = `${game.id}:${reminder.minutes_before}`
        if (sentSet.has(logKey)) continue  // already sent this reminder for this game

        // Not yet within the reminder window
        if (msUntilGame > reminder.minutes_before * 60 * 1000) continue

        const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]
        if (teamIds.length > 0) {
          const { data: members } = await supabase
            .from('team_members')
            .select('profiles!team_members_user_id_fkey(phone, sms_opted_in)')
            .in('team_id', teamIds)

          const players = (members ?? [])
            .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
            .filter(p => p?.phone && p?.sms_opted_in)

          const smsBody = `${orgName} – ${leagueName}\n\n${reminder.message_template}${venue ? `\n${venue}` : ''} · ${gameTime}\n\nReply STOP to unsubscribe.`

          for (const player of players) {
            await sendSms(player!.phone!, smsBody).catch(() => {})
          }
        }

        // Log as sent (even if no players, so we don't retry)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('game_sms_reminder_logs')
          .insert({ game_id: game.id, minutes_before: reminder.minutes_before })
          .catch(() => {})
        sentSet.add(logKey)
        results.push(`sms reminder game ${game.id} (${reminder.minutes_before}min)`)
      }
    }
  }

  return NextResponse.json({ ok: true, processed: results })
}
