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
    .select('id, organization_id, scheduled_at, home_team_id, away_team_id, court, leagues(name)')
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
          ${game.court ? `<p><strong>Venue:</strong> ${game.court}</p>` : ''}
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
    home_team_id: string | null; away_team_id: string | null; court: string | null
    leagues: { name: string } | null
  }
  type LogRow = { game_id: string; minutes_before: number }

  // Diagnostics — returned in the response so you can call the endpoint and see exactly what's happening
  const sms_diagnostics: Record<string, unknown> = {}

  // Fetch all enabled reminder configs and master toggles
  const [{ data: reminderConfigs, error: reminderConfigsErr }, { data: notifSettings }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_sms_reminders')
      .select('organization_id, minutes_before, message_template')
      .eq('enabled', true) as Promise<{ data: ReminderConfig[] | null; error: unknown }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('org_notification_settings')
      .select('organization_id, sms_game_reminders_enabled') as Promise<{ data: NotifSetting[] | null }>,
  ])

  if (reminderConfigsErr) sms_diagnostics.reminder_config_error = JSON.stringify(reminderConfigsErr)

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

  sms_diagnostics.reminder_configs_total = (reminderConfigs ?? []).length
  sms_diagnostics.orgs_with_reminders = remindersByOrg.size
  sms_diagnostics.orgs_with_sms_disabled = [...disabledOrgs]
  sms_diagnostics.window = { from: now.toISOString(), to: in24h.toISOString() }

  if (remindersByOrg.size === 0) {
    sms_diagnostics.skipped_reason = 'No enabled reminder configs found in org_sms_reminders. Go to Admin → Settings → Notifications to add reminders.'
  } else {
    // Fetch org names for all orgs that have reminders configured
    const orgIds = [...remindersByOrg.keys()]
    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
    const orgNameById = new Map((orgRows ?? []).map(o => [o.id, o.name]))

    // Fetch all upcoming games in the next 24h (widest possible reminder window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: smsGames, error: gamesErr } = await (supabase as any)
      .from('games')
      .select('id, organization_id, scheduled_at, home_team_id, away_team_id, court, leagues(name)')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in24h.toISOString()) as { data: GameRow[] | null; error: unknown }

    if (gamesErr) sms_diagnostics.games_query_error = JSON.stringify(gamesErr)
    sms_diagnostics.upcoming_games_in_window = (smsGames ?? []).length

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
    const gameSkips: Record<string, string[]> = {}

    for (const game of smsGames ?? []) {
      const orgId = game.organization_id
      const skipReasons: string[] = []

      if (disabledOrgs.has(orgId)) {
        skipReasons.push('org_sms_disabled')
        gameSkips[game.id] = skipReasons
        continue
      }

      const orgReminders = remindersByOrg.get(orgId)
      if (!orgReminders || orgReminders.length === 0) {
        skipReasons.push('no_reminder_config_for_this_org')
        gameSkips[game.id] = skipReasons
        continue
      }

      const msUntilGame = new Date(game.scheduled_at).getTime() - now.getTime()
      const minUntilGame = Math.round(msUntilGame / 60000)

      // Resolve org/league names once per game
      const league = game.leagues
      const orgName = orgNameById.get(orgId) ?? 'Fieldday'
      const leagueName = league?.name ?? 'Game'
      const gameTime = new Date(game.scheduled_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
      const venue = game.court ? ` · ${game.court}` : ''

      for (const reminder of orgReminders) {
        const logKey = `${game.id}:${reminder.minutes_before}`

        if (sentSet.has(logKey)) {
          skipReasons.push(`${reminder.minutes_before}min:already_sent`)
          continue
        }

        if (msUntilGame > reminder.minutes_before * 60 * 1000) {
          skipReasons.push(`${reminder.minutes_before}min:outside_window(${minUntilGame}min_until_game)`)
          continue
        }

        const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]
        if (teamIds.length === 0) {
          // No teams assigned — skip the log insert so it retries when teams are added
          skipReasons.push(`${reminder.minutes_before}min:no_teams_assigned`)
          continue
        }

        const { data: members } = await supabase
          .from('team_members')
          .select('profiles!team_members_user_id_fkey(phone, sms_opted_in)')
          .in('team_id', teamIds)

        const allPlayers = (members ?? [])
          .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
          .filter(Boolean)
        const optedInPlayers = allPlayers.filter(p => p?.phone && p?.sms_opted_in)

        if (optedInPlayers.length === 0) {
          const noPhone = allPlayers.filter(p => !p?.phone).length
          const notOptedIn = allPlayers.filter(p => p?.phone && !p?.sms_opted_in).length
          skipReasons.push(`${reminder.minutes_before}min:no_opted_in_players(${allPlayers.length}_total,${noPhone}_no_phone,${notOptedIn}_not_opted_in)`)
          // Still log as sent so we don't retry every 15min for events with no opted-in players
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('game_sms_reminder_logs')
            .insert({ game_id: game.id, minutes_before: reminder.minutes_before })
            .catch(() => {})
          sentSet.add(logKey)
          continue
        }

        const smsBody = `${orgName} – ${leagueName}\n\n${reminder.message_template}${venue ? `\n${venue}` : ''} · ${gameTime}\n\nReply STOP to unsubscribe.`

        let sentCount = 0
        let failCount = 0
        for (const player of optedInPlayers) {
          try {
            await sendSms(player!.phone!, smsBody)
            sentCount++
          } catch (e) {
            failCount++
            results.push(`sms error game ${game.id} player ${player!.phone}: ${e}`)
          }
        }

        // Log as sent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('game_sms_reminder_logs')
          .insert({ game_id: game.id, minutes_before: reminder.minutes_before })
          .catch(() => {})
        sentSet.add(logKey)
        results.push(`sms reminder game ${game.id} (${reminder.minutes_before}min): ${sentCount} sent, ${failCount} failed`)
      }

      if (skipReasons.length > 0) gameSkips[game.id] = skipReasons
    }

    if (Object.keys(gameSkips).length > 0) sms_diagnostics.game_skips = gameSkips
  }

  return NextResponse.json({ ok: true, processed: results, sms_diagnostics })
}
