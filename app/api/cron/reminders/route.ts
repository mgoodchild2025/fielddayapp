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
  try {
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
    const teamIds = [game.home_team_id, game.away_team_id].filter((id): id is string => Boolean(id))
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
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

        // Claim the send slot atomically before doing any work.
        // If another concurrent cron run already inserted this row the upsert
        // returns 0 rows (ignoreDuplicates) and we skip — preventing duplicate sends.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: claimed } = await (supabase as any)
          .from('game_sms_reminder_logs')
          .upsert(
            { game_id: game.id, minutes_before: reminder.minutes_before },
            { onConflict: 'game_id,minutes_before', ignoreDuplicates: true }
          )
          .select('game_id')
        if (!claimed || claimed.length === 0) {
          skipReasons.push(`${reminder.minutes_before}min:already_claimed_by_concurrent_run`)
          sentSet.add(logKey)
          continue
        }
        sentSet.add(logKey)

        const { data: members } = await supabase
          .from('team_members')
          .select('profiles!team_members_user_id_fkey(phone, sms_opted_in)')
          .in('team_id', teamIds)

        const allPlayers = (members ?? [])
          .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
          .filter(Boolean)

        // Deduplicate by phone — a player on both home and away team would appear twice otherwise
        const seenPhones = new Set<string>()
        const optedInPlayers = allPlayers.filter(p => {
          if (!p?.phone || !p?.sms_opted_in) return false
          if (seenPhones.has(p.phone)) return false
          seenPhones.add(p.phone)
          return true
        })

        if (optedInPlayers.length === 0) {
          const noPhone = allPlayers.filter(p => !p?.phone).length
          const notOptedIn = allPlayers.filter(p => p?.phone && !p?.sms_opted_in).length
          skipReasons.push(`${reminder.minutes_before}min:no_opted_in_players(${allPlayers.length}_total,${noPhone}_no_phone,${notOptedIn}_not_opted_in)`)
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

        results.push(`sms reminder game ${game.id} (${reminder.minutes_before}min): ${sentCount} sent, ${failCount} failed`)
      }

      if (skipReasons.length > 0) gameSkips[game.id] = skipReasons
    }

    if (Object.keys(gameSkips).length > 0) sms_diagnostics.game_skips = gameSkips
  }

  // 5. Game Day SMS — one per player per org per calendar day
  //    Fires for games happening today (within the next 16 hours, after 7 am local org time)
  //    Groups all of a player's games for the day into a single message.

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const gameDay_diagnostics: Record<string, unknown> = {}

  // Fetch all orgs that have at least one opted-in player (by checking org_branding for timezone)
  // We query games in the next 16 hours across all orgs, then group by org timezone
  const in16h = new Date(now.getTime() + 16 * 60 * 60 * 1000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gameDayGames, error: gameDayGamesErr } = await (supabase as any)
    .from('games')
    .select(`
      id, organization_id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      leagues(name)
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in16h.toISOString())

  if (gameDayGamesErr) gameDay_diagnostics.games_error = JSON.stringify(gameDayGamesErr)
  gameDay_diagnostics.games_in_window = (gameDayGames ?? []).length

  if ((gameDayGames ?? []).length > 0) {
    // Fetch org branding for timezone + org names for all orgs in the result set
    const gameDayOrgIds = [...new Set((gameDayGames as { organization_id: string }[]).map(g => g.organization_id))]

    const [{ data: brandingRows }, { data: gameDayOrgRows }] = await Promise.all([
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', gameDayOrgIds),
      supabase.from('organizations').select('id, name, slug').in('id', gameDayOrgIds),
    ])

    const timezoneByOrg = new Map((brandingRows ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))
    const orgInfoById = new Map((gameDayOrgRows ?? []).map(o => [o.id, { name: o.name, slug: o.slug }]))

    // Group games by org
    type GDGame = {
      id: string; organization_id: string; scheduled_at: string; court: string | null
      home_team: { id: string; name: string } | null
      away_team: { id: string; name: string } | null
      leagues: { name: string } | { name: string }[] | null
    }
    const gamesByOrg = new Map<string, GDGame[]>()
    for (const g of (gameDayGames as GDGame[]) ?? []) {
      if (!gamesByOrg.has(g.organization_id)) gamesByOrg.set(g.organization_id, [])
      gamesByOrg.get(g.organization_id)!.push(g)
    }

    for (const [orgId, orgGames] of gamesByOrg) {
      const timezone = timezoneByOrg.get(orgId) ?? 'America/Toronto'
      const orgInfo = orgInfoById.get(orgId)

      // Only send after 7 am local time
      const localHour = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now), 10)
      if (localHour < 7) continue

      // Today's date in org timezone (YYYY-MM-DD)
      const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)

      // Collect all team IDs from today's games
      const teamIds = [...new Set(
        orgGames.flatMap(g => [g.home_team?.id, g.away_team?.id]).filter(Boolean) as string[]
      )]
      if (teamIds.length === 0) continue

      // Get opted-in players with game-day SMS enabled
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, team_id, profiles!team_members_user_id_fkey(phone, full_name, sms_opted_in, sms_game_day_enabled)')
        .in('team_id', teamIds)

      // Build map: user_id → { phone, name, teamIds[] }
      type PlayerEntry = { phone: string; name: string; teamIds: Set<string> }
      const playerMap = new Map<string, PlayerEntry>()
      for (const m of members ?? []) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!p?.phone || !(p as any)?.sms_opted_in || !(p as any)?.sms_game_day_enabled) continue
        if (!m.team_id || !m.user_id) continue
        const userId = m.user_id
        const teamId = m.team_id
        if (!playerMap.has(userId)) {
          playerMap.set(userId, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set() })
        }
        playerMap.get(userId)!.teamIds.add(teamId)
      }

      if (playerMap.size === 0) continue

      // Check already-sent logs for today
      const userIds = [...playerMap.keys()]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sentToday } = await (supabase as any)
        .from('player_game_day_sms_logs')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('log_date', todayLocal)
        .in('user_id', userIds)

      const alreadySentSet = new Set((sentToday ?? []).map((r: { user_id: string }) => r.user_id))

      const scheduleUrl = `https://${orgInfo?.slug}.${platformDomain}/schedule`

      for (const [userId, player] of playerMap) {
        if (alreadySentSet.has(userId)) continue

        // Find this player's games today (games where they're on the home or away team)
        const myGames = orgGames.filter(g =>
          (g.home_team?.id && player.teamIds.has(g.home_team.id)) ||
          (g.away_team?.id && player.teamIds.has(g.away_team.id))
        ).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

        if (myGames.length === 0) continue

        // Claim the send slot atomically before sending.
        // If a concurrent cron run already inserted this row the upsert returns 0 rows.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: claimed } = await (supabase as any)
          .from('player_game_day_sms_logs')
          .upsert(
            { user_id: userId, organization_id: orgId, log_date: todayLocal },
            { onConflict: 'user_id,organization_id,log_date', ignoreDuplicates: true }
          )
          .select('user_id')
        if (!claimed || claimed.length === 0) continue // already sent by a concurrent run

        // Build game lines
        const gameLines = myGames.map(g => {
          const league = Array.isArray(g.leagues) ? g.leagues[0] : g.leagues
          const myTeamIsHome = g.home_team?.id && player.teamIds.has(g.home_team.id)
          const opponent = myTeamIsHome ? g.away_team?.name : g.home_team?.name
          const time = new Date(g.scheduled_at).toLocaleTimeString('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
          const venue = g.court ? ` · ${g.court}` : ''
          const leagueName = league?.name ? `[${league.name}] ` : ''
          return opponent
            ? `${leagueName}${time}${venue} vs ${opponent}`
            : `${leagueName}${time}${venue}`
        })

        const orgName = orgInfo?.name ?? 'Fieldday'
        const intro = myGames.length === 1
          ? `🏆 It's Game Day, ${player.name.split(' ')[0] || 'there'}!`
          : `🏆 It's Game Day, ${player.name.split(' ')[0] || 'there'}! You've got ${myGames.length} games today.`

        const smsBody = `${orgName}\n\n${intro}\n\n${gameLines.join('\n')}\n\nView your schedule: ${scheduleUrl}\n\nReply STOP to unsubscribe.`

        try {
          await sendSms(player.phone, smsBody)
          results.push(`game_day sms sent to ${userId} (${orgId})`)
        } catch (e) {
          results.push(`game_day sms error for ${userId}: ${e}`)
        }
      }
    }
  }

  sms_diagnostics.game_day = gameDay_diagnostics

  return NextResponse.json({ ok: true, processed: results, sms_diagnostics })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 })
  }
}
