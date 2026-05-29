import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms } from '@/lib/twilio'
import { deliverAnnouncementEmails } from '@/actions/messages'
import { formatCourtLabel } from '@/lib/venue-label'

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

  // 2. Game reminders — one email per player per day listing all their games tomorrow
  //    Groups multiple games on the same day into a single digest email.
  //
  //    Query window is 48 h so we always capture all of "tomorrow" regardless of what
  //    time the cron fires. A midnight run would only reach 24 h (= start of tomorrow),
  //    missing games later in the day. Per-org local-date filtering below narrows the
  //    result to games whose calendar date in the org's timezone equals exactly tomorrow.
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)  // kept for SMS section
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reminderGames } = await (supabase as any)
    .from('games')
    .select(`
      id, organization_id, scheduled_at, court, league_id,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      leagues(name, sport)
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in48h.toISOString())

  // Collect personalized game-reminder emails across all orgs; batch-send after the loop
  // to avoid Resend's 5 req/s rate limit.
  const reminderEmailBatch: Array<{ from: string; to: string; subject: string; html: string }> = []

  if ((reminderGames ?? []).length > 0) {
    // Fetch org branding (timezone) and org names
    type RGGame = {
      id: string; organization_id: string; scheduled_at: string; court: string | null
      league_id: string | null
      home_team: { id: string; name: string } | null
      away_team: { id: string; name: string } | null
      leagues: { name: string; sport?: string | null } | { name: string; sport?: string | null }[] | null
    }
    const rgOrgIds = [...new Set((reminderGames as RGGame[]).map(g => g.organization_id))]
    const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
    const [{ data: rgBranding }, { data: rgOrgs }] = await Promise.all([
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', rgOrgIds),
      supabase.from('organizations').select('id, name, slug').in('id', rgOrgIds),
    ])
    const rgTimezoneByOrg = new Map((rgBranding ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))
    const rgOrgNameById = new Map((rgOrgs ?? []).map(o => [o.id, o.name]))
    const rgOrgSlugById = new Map((rgOrgs ?? []).map(o => [o.id, o.slug]))

    // Group games by org
    const rgGamesByOrg = new Map<string, RGGame[]>()
    for (const g of (reminderGames as RGGame[]) ?? []) {
      if (!rgGamesByOrg.has(g.organization_id)) rgGamesByOrg.set(g.organization_id, [])
      rgGamesByOrg.get(g.organization_id)!.push(g)
    }

    for (const [orgId, orgGames] of rgGamesByOrg) {
      const timezone = rgTimezoneByOrg.get(orgId) ?? 'America/Toronto'
      const orgName = rgOrgNameById.get(orgId) ?? 'Fieldday'

      // "Tomorrow" date in org timezone (the date the games are on)
      const tomorrowLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
        .format(new Date(now.getTime() + 24 * 60 * 60 * 1000))

      // Filter to only games whose LOCAL calendar date equals tomorrow.
      // Without this, a midnight cron run would pick up same-day games
      // (e.g. a 7pm game tonight falls within [now, now+48h] but its
      // local date is today, not tomorrow).
      const orgGamesTomorrow = orgGames.filter(g => {
        const gameLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
          .format(new Date(g.scheduled_at))
        return gameLocalDate === tomorrowLocal
      })
      if (orgGamesTomorrow.length === 0) continue

      const teamIds = [...new Set(
        orgGamesTomorrow.flatMap(g => [g.home_team?.id, g.away_team?.id]).filter(Boolean) as string[]
      )]

      // Pickup/drop-in games have no teams — recipients are league registrants instead
      const pickupLeagueIds = [...new Set(
        orgGamesTomorrow
          .filter(g => !g.home_team && !g.away_team && g.league_id)
          .map(g => g.league_id as string)
      )]

      if (teamIds.length === 0 && pickupLeagueIds.length === 0) continue

      // Fetch team members (regular games) and pickup registrants in parallel
      const [{ data: rgMembers }, { data: pickupRegs }] = await Promise.all([
        teamIds.length > 0
          ? supabase
              .from('team_members')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .select('user_id, team_id, profiles!team_members_user_id_fkey(email, full_name, email_reminders_enabled)' as any)
              .in('team_id', teamIds)
          : Promise.resolve({ data: [] as unknown[] }),
        pickupLeagueIds.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from('registrations')
              .select('user_id, league_id')
              .in('league_id', pickupLeagueIds)
              .in('status', ['active', 'pending'])
          : Promise.resolve({ data: [] as unknown[] }),
      ])

      // Build map: user_id → { email, name, teamIds, subGameIds, pickupLeagueIds }
      type RGPlayer = { email: string; name: string; teamIds: Set<string>; subGameIds: Set<string>; pickupLeagueIds: Set<string> }
      const rgPlayerMap = new Map<string, RGPlayer>()

      for (const m of (rgMembers ?? []) as { user_id?: string; team_id?: string; profiles?: unknown }[]) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { email?: string; full_name?: string; email_reminders_enabled?: boolean } | null
        // Skip if no email or opted out (null = not yet set, treat as opted in)
        if (!p?.email || p?.email_reminders_enabled === false) continue
        if (!m.user_id || !m.team_id) continue
        if (!rgPlayerMap.has(m.user_id)) {
          rgPlayerMap.set(m.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
        }
        rgPlayerMap.get(m.user_id)!.teamIds.add(m.team_id)
      }

      // For pickup registrants, fetch profiles separately then add to map
      if (pickupLeagueIds.length > 0 && (pickupRegs ?? []).length > 0) {
        const pickupUserIds = [...new Set((pickupRegs as { user_id: string; league_id: string }[]).map(r => r.user_id).filter(Boolean))]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pickupProfiles } = await (supabase as any)
          .from('profiles')
          .select('id, email, full_name, email_reminders_enabled')
          .in('id', pickupUserIds)
        type PickupProfile = { id: string; email?: string; full_name?: string; email_reminders_enabled?: boolean }
        const profileById = new Map<string, PickupProfile>((pickupProfiles ?? []).map((p: PickupProfile) => [p.id, p]))

        for (const r of (pickupRegs as { user_id: string; league_id: string }[]) ?? []) {
          if (!r.user_id || !r.league_id) continue
          const p = profileById.get(r.user_id)
          if (!p?.email || p?.email_reminders_enabled === false) continue
          if (!rgPlayerMap.has(r.user_id)) {
            rgPlayerMap.set(r.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
          }
          rgPlayerMap.get(r.user_id)!.pickupLeagueIds.add(r.league_id)
        }
      }

      // Also include confirmed game subs for tomorrow's games
      const orgGameIds = orgGamesTomorrow.map(g => g.id as string)
      if (orgGameIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: subRows } = await (supabase as any)
          .from('game_subs')
          .select('user_id, game_id, profiles!game_subs_user_id_fkey(email, full_name, email_reminders_enabled)')
          .eq('organization_id', orgId)
          .eq('status', 'confirmed')
          .not('user_id', 'is', null)
          .in('game_id', orgGameIds)
        for (const s of subRows ?? []) {
          const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles as { email?: string; full_name?: string; email_reminders_enabled?: boolean } | null
          if (!p?.email || p?.email_reminders_enabled === false) continue
          if (!s.user_id || !s.game_id) continue
          if (!rgPlayerMap.has(s.user_id)) {
            rgPlayerMap.set(s.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
          }
          rgPlayerMap.get(s.user_id)!.subGameIds.add(s.game_id)
        }
      }

      if (rgPlayerMap.size === 0) continue

      // Check already-sent logs for tomorrow's date
      const rgUserIds = [...rgPlayerMap.keys()]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rgSentToday } = await (supabase as any)
        .from('player_email_reminder_logs')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('log_date', tomorrowLocal)
        .in('user_id', rgUserIds)
      const rgAlreadySent = new Set((rgSentToday ?? []).map((r: { user_id: string }) => r.user_id))

      for (const [userId, player] of rgPlayerMap) {
        if (rgAlreadySent.has(userId)) continue

        const myGames = orgGamesTomorrow.filter(g => {
          const isPickup = !g.home_team && !g.away_team
          if (isPickup) return g.league_id ? player.pickupLeagueIds.has(g.league_id) : false
          return (g.home_team?.id && player.teamIds.has(g.home_team.id)) ||
            (g.away_team?.id && player.teamIds.has(g.away_team.id)) ||
            player.subGameIds.has(g.id as string)
        }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

        if (myGames.length === 0) continue

        // Claim send slot atomically — PK conflict on UNIQUE(user_id, organization_id, log_date) prevents duplicates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: rgClaimErr } = await (supabase as any)
          .from('player_email_reminder_logs')
          .insert({ user_id: userId, organization_id: orgId, log_date: tomorrowLocal })
        if (rgClaimErr) {
          if (rgClaimErr.code === '23505') continue // concurrent run already claimed
          results.push(`email reminder log error for ${userId}: ${rgClaimErr.message}`)
          continue
        }

        const firstName = player.name.split(' ')[0] || 'there'
        const orgSlug = rgOrgSlugById.get(orgId) ?? ''
        const profileUrl = orgSlug
          ? `https://${orgSlug}.${PLATFORM_DOMAIN}/profile`
          : `https://app.${PLATFORM_DOMAIN}/profile`
        // Derive the date label from the actual game date, not now+24h.
        // If the cron runs in the early morning, now+24h can land on the wrong calendar day.
        const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' })
          .format(new Date(myGames[0].scheduled_at))

        const gameRows = myGames.map(g => {
          const league = Array.isArray(g.leagues) ? g.leagues[0] : g.leagues
          const myTeamIsHome = g.home_team?.id && player.teamIds.has(g.home_team.id)
          const opponent = myTeamIsHome ? g.away_team?.name : g.home_team?.name
          const time = new Date(g.scheduled_at).toLocaleTimeString('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
          const courtLabel = formatCourtLabel(g.court, league?.sport)
          const venue = courtLabel ? `<br><span style="color:#666;font-size:13px">${courtLabel}</span>` : ''
          const leagueLabel = league?.name ? `<span style="color:#666;font-size:13px">${league.name}</span><br>` : ''
          const vsLabel = opponent ? ` vs ${opponent}` : ''
          return `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0">${leagueLabel}<strong>${time}${vsLabel}</strong>${venue}</td></tr>`
        }).join('')

        const subject = myGames.length === 1
          ? `Game reminder: you have a game tomorrow`
          : `Game reminder: you have ${myGames.length} games tomorrow`

        reminderEmailBatch.push({
          from: FROM_EMAIL,
          to: player.email,
          subject,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="margin-top:0">Hi ${firstName}, you have ${myGames.length === 1 ? 'a game' : `${myGames.length} games`} tomorrow!</h2>
            <p style="color:#555;margin-bottom:16px">${dateLabel}</p>
            <table style="width:100%;border-collapse:collapse">${gameRows}</table>
            <p style="margin-top:24px;font-size:12px;color:#999;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.6;">
              You&rsquo;re receiving this because you&rsquo;re registered with <strong>${orgName}</strong>, powered by Fieldday.<br>
              To stop receiving game reminders, update your <a href="${profileUrl}" style="color:#999">notification preferences</a> in your profile.
            </p>
          </div>`,
        })

        results.push(`email reminder queued for ${userId} (${myGames.length} game${myGames.length !== 1 ? 's' : ''})`)
      }
    }
  }

  // Flush the game-reminder email batch (up to 100 emails per Resend batch call)
  if (reminderEmailBatch.length > 0) {
    const EMAIL_BATCH_SIZE = 100
    for (let i = 0; i < reminderEmailBatch.length; i += EMAIL_BATCH_SIZE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (resend.batch as any).send(reminderEmailBatch.slice(i, i + EMAIL_BATCH_SIZE))
        .catch((e: unknown) => results.push(`email batch send error: ${e}`))
    }
    results.push(`email reminder batch: ${reminderEmailBatch.length} email(s) dispatched`)
  }

  // 3. Payment reminders — overdue installments
  const paymentEmailBatch: Array<{ from: string; to: string; subject: string; html: string }> = []
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

    paymentEmailBatch.push({
      from: FROM_EMAIL,
      to: profile.email,
      subject: 'Payment reminder — installment overdue',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2>Payment Reminder</h2>
        <p>Hi ${profile.full_name ?? 'there'},</p>
        <p>You have an overdue installment of <strong>$${(inst.amount_cents / 100).toFixed(2)} CAD</strong> due ${new Date(inst.due_date).toLocaleDateString('en-CA')}.</p>
        <p>Please log in to your account to complete your payment.</p>
        <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin-top:24px;line-height:1.6;">
          You&rsquo;re receiving this because you have an active payment plan for a league registration, powered by Fieldday.
        </p>
      </div>`,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('payment_plan_installments')
      .update({ reminder_sent: now.toISOString() })
      .eq('id', inst.id)

    results.push(`payment reminder installment ${inst.id}`)
  }

  // Flush payment reminder email batch
  if (paymentEmailBatch.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (resend.batch as any).send(paymentEmailBatch)
      .catch((e: unknown) => results.push(`payment email batch error: ${e}`))
  }

  // 4. SMS game reminders — multi-reminder system using org_sms_reminders + game_sms_reminder_logs

  type ReminderConfig = { organization_id: string; minutes_before: number; message_template: string }
  type NotifSetting = { organization_id: string; sms_game_reminders_enabled: boolean }
  type GameRow = {
    id: string; organization_id: string; scheduled_at: string
    home_team_id: string | null; away_team_id: string | null; court: string | null
    leagues: { name: string; sport?: string | null } | null
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
      .select('id, organization_id, scheduled_at, home_team_id, away_team_id, court, leagues(name, sport)')
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
      const courtLabel = formatCourtLabel(game.court, league?.sport)
      const venue = courtLabel ? ` · ${courtLabel}` : ''

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
        // Plain INSERT — if the row already exists (PK conflict on game_id+minutes_before),
        // Postgres returns error code 23505 and we skip, preventing duplicate sends.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: claimErr } = await (supabase as any)
          .from('game_sms_reminder_logs')
          .insert({ game_id: game.id, minutes_before: reminder.minutes_before })
        if (claimErr) {
          if (claimErr.code === '23505') {
            // Already inserted by this or a concurrent run — skip
            skipReasons.push(`${reminder.minutes_before}min:already_claimed_by_concurrent_run`)
            sentSet.add(logKey)
          } else {
            skipReasons.push(`${reminder.minutes_before}min:log_insert_error(${claimErr.message})`)
          }
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
      leagues(name, sport)
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
      leagues: { name: string; sport?: string | null } | { name: string; sport?: string | null }[] | null
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

      // Build map: user_id → { phone, name, teamIds[], subGameIds[] }
      type PlayerEntry = { phone: string; name: string; teamIds: Set<string>; subGameIds: Set<string> }
      const playerMap = new Map<string, PlayerEntry>()
      for (const m of members ?? []) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!p?.phone || !(p as any)?.sms_opted_in || !(p as any)?.sms_game_day_enabled) continue
        if (!m.team_id || !m.user_id) continue
        const userId = m.user_id
        const teamId = m.team_id
        if (!playerMap.has(userId)) {
          playerMap.set(userId, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set() })
        }
        playerMap.get(userId)!.teamIds.add(teamId)
      }

      // Include confirmed game subs for today's games
      const smsGameIds = orgGames.map(g => g.id as string)
      if (smsGameIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: smsSubRows } = await (supabase as any)
          .from('game_subs')
          .select('user_id, game_id, profiles!game_subs_user_id_fkey(phone, full_name, sms_opted_in, sms_game_day_enabled)')
          .eq('organization_id', orgId)
          .eq('status', 'confirmed')
          .not('user_id', 'is', null)
          .in('game_id', smsGameIds)
        for (const s of smsSubRows ?? []) {
          const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!p?.phone || !(p as any)?.sms_opted_in || !(p as any)?.sms_game_day_enabled) continue
          if (!s.user_id || !s.game_id) continue
          if (!playerMap.has(s.user_id)) {
            playerMap.set(s.user_id, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set() })
          }
          playerMap.get(s.user_id)!.subGameIds.add(s.game_id)
        }
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

        // Find this player's games today (games where they're on the home or away team, or confirmed sub)
        const myGames = orgGames.filter(g =>
          (g.home_team?.id && player.teamIds.has(g.home_team.id)) ||
          (g.away_team?.id && player.teamIds.has(g.away_team.id)) ||
          player.subGameIds.has(g.id as string)
        ).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

        if (myGames.length === 0) continue

        // Claim the send slot atomically before sending.
        // Plain INSERT — if the row already exists (UNIQUE constraint on user_id+organization_id+log_date),
        // Postgres returns error code 23505 and we skip, preventing duplicate sends even across
        // concurrent cron runs. Upsert was unreliable here because the table has an auto-generated
        // UUID primary key — every upsert payload without an explicit id generated a new UUID,
        // so the PK conflict never fired and every upsert inserted a new row.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: claimErr } = await (supabase as any)
          .from('player_game_day_sms_logs')
          .insert({ user_id: userId, organization_id: orgId, log_date: todayLocal })
        if (claimErr) {
          if (claimErr.code === '23505') continue // already sent — skip silently
          results.push(`game_day log error for ${userId}: ${claimErr.message}`)
          continue
        }

        // Build game lines
        const gameLines = myGames.map(g => {
          const league = Array.isArray(g.leagues) ? g.leagues[0] : g.leagues
          const myTeamIsHome = g.home_team?.id && player.teamIds.has(g.home_team.id)
          const opponent = myTeamIsHome ? g.away_team?.name : g.home_team?.name
          const time = new Date(g.scheduled_at).toLocaleTimeString('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
          const courtLabel = formatCourtLabel(g.court, league?.sport)
          const venue = courtLabel ? ` · ${courtLabel}` : ''
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

  // 6. Waiver registration reminder — 24 h before event start
  //    Emails captains and coaches listing players who haven't registered yet.
  //    Only fires for leagues that have a waiver configured and a season_start_date set.
  //    One email per team per league (deduplicated via league_waiver_reminder_logs).

  const waiverReminderEmails: Array<{ from: string; to: string; subject: string; html: string }> = []

  // Widen the query to a 48-h window so any timezone lands in range;
  // per-org timezone check below narrows it to "actually tomorrow locally".
  const win48Start = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString().split('T')[0]
  const win48End   = new Date(now.getTime() + 54 * 60 * 60 * 1000).toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: waiverLeagues } = await (supabase as any)
    .from('leagues')
    .select('id, name, slug, organization_id, season_start_date')
    .in('status', ['active', 'registration_open'])
    .not('waiver_version_id', 'is', null)
    .not('season_start_date', 'is', null)
    .gte('season_start_date', win48Start)
    .lte('season_start_date', win48End)

  if ((waiverLeagues ?? []).length > 0) {
    const wlOrgIds = [...new Set((waiverLeagues as { organization_id: string }[]).map(l => l.organization_id))]

    const [{ data: wlBranding }, { data: wlOrgs }] = await Promise.all([
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', wlOrgIds),
      supabase.from('organizations').select('id, name, slug').in('id', wlOrgIds),
    ])

    const wlTimezoneByOrg = new Map((wlBranding ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))
    const wlOrgById       = new Map((wlOrgs ?? []).map(o => [o.id, { name: o.name, slug: o.slug }]))

    type WLLeague = { id: string; name: string; slug: string; organization_id: string; season_start_date: string }

    for (const league of (waiverLeagues as WLLeague[]) ?? []) {
      const timezone = wlTimezoneByOrg.get(league.organization_id) ?? 'America/Toronto'

      // Check if season_start_date is exactly tomorrow in the org's timezone
      const tomorrowInOrgTz = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
        .format(new Date(now.getTime() + 24 * 60 * 60 * 1000))
      if (league.season_start_date !== tomorrowInOrgTz) continue

      const orgInfo = wlOrgById.get(league.organization_id)
      const orgName = orgInfo?.name ?? 'Fieldday'
      const orgSlug = orgInfo?.slug ?? ''
      const registerUrl = `https://${orgSlug}.${platformDomain}/register/${league.slug}`

      const dateLabel = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
      }).format(new Date(`${league.season_start_date}T12:00:00`))

      // Fetch all teams in this league
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wlTeams } = await (supabase as any)
        .from('teams')
        .select('id, name')
        .eq('league_id', league.id)
        .eq('organization_id', league.organization_id)
        .eq('status', 'active')

      if (!wlTeams || wlTeams.length === 0) continue

      const teamIds = (wlTeams as { id: string; name: string }[]).map(t => t.id)

      // Fetch all active team members for these teams (captains, coaches, players)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wlMembers } = await (supabase as any)
        .from('team_members')
        .select('team_id, user_id, role, profiles!team_members_user_id_fkey(full_name, email)')
        .in('team_id', teamIds)
        .eq('status', 'active')

      // Fetch active registrations for this league
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wlRegs } = await (supabase as any)
        .from('registrations')
        .select('user_id')
        .eq('league_id', league.id)
        .eq('organization_id', league.organization_id)
        .in('status', ['active', 'pending'])

      const registeredUserIds = new Set((wlRegs ?? []).map((r: { user_id: string }) => r.user_id))

      // Fetch already-sent log entries for this league's teams
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wlLogs } = await (supabase as any)
        .from('league_waiver_reminder_logs')
        .select('team_id')
        .eq('league_id', league.id)
        .in('team_id', teamIds)

      const alreadySentTeams = new Set((wlLogs ?? []).map((l: { team_id: string }) => l.team_id))

      // Group members by team
      type WLMember = {
        team_id: string; user_id: string; role: string
        profiles: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null
      }
      const membersByTeam = new Map<string, WLMember[]>()
      for (const m of (wlMembers ?? []) as WLMember[]) {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, [])
        membersByTeam.get(m.team_id)!.push(m)
      }

      for (const team of (wlTeams as { id: string; name: string }[])) {
        if (alreadySentTeams.has(team.id)) continue

        const members = membersByTeam.get(team.id) ?? []

        // Find captains and coaches (they'll receive the email)
        const leaders = members.filter(m => ['captain', 'coach'].includes(m.role))
        if (leaders.length === 0) continue

        // Find players who haven't registered yet
        const unregistered = members
          .filter(m => !['captain', 'coach'].includes(m.role)) // players only
          .filter(m => m.user_id && !registeredUserIds.has(m.user_id))
          .map(m => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            return p?.full_name ?? 'Unknown Player'
          })

        if (unregistered.length === 0) continue // everyone's registered — no email needed

        // Claim the send slot before sending
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: logErr } = await (supabase as any)
          .from('league_waiver_reminder_logs')
          .insert({ league_id: league.id, team_id: team.id })
        if (logErr) {
          if (logErr.code === '23505') continue // concurrent run claimed it
          results.push(`waiver reminder log error team ${team.id}: ${logErr.message}`)
          continue
        }

        const playerListHtml = unregistered
          .map(name => `<li style="padding:2px 0">${name}</li>`)
          .join('')

        const subject = `Reminder: ${unregistered.length} player${unregistered.length !== 1 ? 's' : ''} still need${unregistered.length === 1 ? 's' : ''} to register for ${league.name}`

        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="margin-top:0">${league.name} starts tomorrow — ${dateLabel}</h2>
          <p style="color:#555">Hi Captain/Coach,</p>
          <p style="color:#555">
            <strong>${unregistered.length} player${unregistered.length !== 1 ? 's' : ''}</strong> on
            <strong>${team.name}</strong> haven't registered yet.
            Registration includes signing the waiver, which is required to participate and helps speed up check-in on game day.
          </p>
          <p style="color:#555;font-weight:600;margin-bottom:4px">Still needs to register:</p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#333">${playerListHtml}</ul>
          <a href="${registerUrl}" style="display:inline-block;background:#333;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">
            Register for ${league.name} →
          </a>
          <p style="margin-top:24px;font-size:12px;color:#999">
            You're receiving this as a team captain or coach with ${orgName}.<br>
            This reminder was sent 24 hours before your event.
          </p>
        </div>`

        for (const leader of leaders) {
          const p = Array.isArray(leader.profiles) ? leader.profiles[0] : leader.profiles
          if (!p?.email) continue
          waiverReminderEmails.push({ from: FROM_EMAIL, to: p.email, subject, html })
        }

        results.push(`waiver reminder queued for team ${team.id} (${unregistered.length} unregistered, ${leaders.length} leader${leaders.length !== 1 ? 's' : ''})`)
      }
    }
  }

  // Flush waiver reminder batch
  if (waiverReminderEmails.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (resend.batch as any).send(waiverReminderEmails)
      .catch((e: unknown) => results.push(`waiver reminder batch error: ${e}`))
    results.push(`waiver reminder batch: ${waiverReminderEmails.length} email(s) dispatched`)
  }

  return NextResponse.json({ ok: true, processed: results, sms_diagnostics })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 })
  }
}
