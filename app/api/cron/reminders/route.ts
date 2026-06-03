import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { sendSms } from '@/lib/twilio'
import { deliverAnnouncementEmails } from '@/actions/messages'
import { formatCourtLabel } from '@/lib/venue-label'
import { sendPlatformAlert } from '@/actions/platform-settings'
import { buildCaptainPrepEmail, type PrepPlayer } from '@/lib/emails/captain-prep'
import { purgeLeagueData } from '@/lib/purge-league'
import { fetchRecentUploads, youTubeWatchUrl, youTubeEmbedUrl } from '@/lib/youtube'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: due } = await (supabase as any)
    .from('announcements')
    .select('id, organization_id, title, body, audience_type, league_id, team_id, recipient_user_ids, channel, message_class')
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
      user_ids: ann.recipient_user_ids ?? undefined,
      channel: ann.channel ?? 'email',
      message_class: ann.message_class ?? 'transactional',
    }).catch((e: unknown) => results.push(`ann ${ann.id} error: ${e}`))

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
    const [{ data: rgBranding }, { data: rgOrgs }, { data: rgNotifSettings }] = await Promise.all([
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', rgOrgIds),
      supabase.from('organizations').select('id, name, slug').in('id', rgOrgIds),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('org_notification_settings')
        .select('organization_id, email_game_reminders_enabled, email_reminder_hours_before')
        .in('organization_id', rgOrgIds) as Promise<{ data: { organization_id: string; email_game_reminders_enabled: boolean; email_reminder_hours_before: number }[] | null }>,
    ])
    const rgTimezoneByOrg = new Map((rgBranding ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))
    const rgOrgNameById = new Map((rgOrgs ?? []).map(o => [o.id, o.name]))
    const rgOrgSlugById = new Map((rgOrgs ?? []).map(o => [o.id, o.slug]))
    const rgEmailEnabledByOrg = new Map((rgNotifSettings ?? []).map(s => [s.organization_id, s.email_game_reminders_enabled ?? true]))
    const rgEmailHoursByOrg   = new Map((rgNotifSettings ?? []).map(s => [s.organization_id, s.email_reminder_hours_before ?? 24]))

    // Group games by org
    const rgGamesByOrg = new Map<string, RGGame[]>()
    for (const g of (reminderGames as RGGame[]) ?? []) {
      if (!rgGamesByOrg.has(g.organization_id)) rgGamesByOrg.set(g.organization_id, [])
      rgGamesByOrg.get(g.organization_id)!.push(g)
    }

    for (const [orgId, orgGames] of rgGamesByOrg) {
      // Skip if org has disabled email game reminders
      if (rgEmailEnabledByOrg.get(orgId) === false) continue

      const timezone = rgTimezoneByOrg.get(orgId) ?? 'America/Toronto'
      const orgName = rgOrgNameById.get(orgId) ?? 'Fieldday'
      const hoursWindow = rgEmailHoursByOrg.get(orgId) ?? 24
      const msWindow = hoursWindow * 60 * 60 * 1000

      // Filter to games within the org's configured timing window
      const orgGamesInWindow = orgGames.filter(g => {
        const msUntilGame = new Date(g.scheduled_at).getTime() - now.getTime()
        return msUntilGame >= 0 && msUntilGame <= msWindow
      })
      if (orgGamesInWindow.length === 0) continue

      // Group in-window games by local calendar date.
      // A 48-hour window can span two calendar dates; we send a separate
      // digest per date so players get one email per game day.
      const gamesByDate = new Map<string, RGGame[]>()
      for (const g of orgGamesInWindow) {
        const d = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(g.scheduled_at))
        if (!gamesByDate.has(d)) gamesByDate.set(d, [])
        gamesByDate.get(d)!.push(g)
      }

      // Build the player map ONCE for all in-window games (avoids repeated DB fetches per date)
      const allTeamIds = [...new Set(orgGamesInWindow.flatMap(g => [g.home_team?.id, g.away_team?.id]).filter(Boolean) as string[])]
      const allPickupLeagueIds = [...new Set(orgGamesInWindow.filter(g => !g.home_team && !g.away_team && g.league_id).map(g => g.league_id as string))]
      if (allTeamIds.length === 0 && allPickupLeagueIds.length === 0) continue

      const [{ data: rgMembers }, { data: pickupRegs }] = await Promise.all([
        allTeamIds.length > 0
          ? supabase
              .from('team_members')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .select('user_id, team_id, profiles!team_members_user_id_fkey(email, full_name, email_reminders_enabled)' as any)
              .in('team_id', allTeamIds)
          : Promise.resolve({ data: [] as unknown[] }),
        allPickupLeagueIds.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from('registrations')
              .select('user_id, league_id')
              .in('league_id', allPickupLeagueIds)
              .in('status', ['active', 'pending'])
          : Promise.resolve({ data: [] as unknown[] }),
      ])

      type RGPlayer = { email: string; name: string; teamIds: Set<string>; subGameIds: Set<string>; pickupLeagueIds: Set<string> }
      const rgPlayerMap = new Map<string, RGPlayer>()

      for (const m of (rgMembers ?? []) as { user_id?: string; team_id?: string; profiles?: unknown }[]) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { email?: string; full_name?: string; email_reminders_enabled?: boolean } | null
        if (!p?.email || p?.email_reminders_enabled === false) continue
        if (!m.user_id || !m.team_id) continue
        if (!rgPlayerMap.has(m.user_id)) rgPlayerMap.set(m.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
        rgPlayerMap.get(m.user_id)!.teamIds.add(m.team_id)
      }

      if (allPickupLeagueIds.length > 0 && (pickupRegs ?? []).length > 0) {
        const pickupUserIds = [...new Set((pickupRegs as { user_id: string; league_id: string }[]).map(r => r.user_id).filter(Boolean))]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pickupProfiles } = await (supabase as any)
          .from('profiles').select('id, email, full_name, email_reminders_enabled').in('id', pickupUserIds)
        type PickupProfile = { id: string; email?: string; full_name?: string; email_reminders_enabled?: boolean }
        const profileById = new Map<string, PickupProfile>((pickupProfiles ?? []).map((p: PickupProfile) => [p.id, p]))
        for (const r of (pickupRegs as { user_id: string; league_id: string }[]) ?? []) {
          if (!r.user_id || !r.league_id) continue
          const p = profileById.get(r.user_id)
          if (!p?.email || p?.email_reminders_enabled === false) continue
          if (!rgPlayerMap.has(r.user_id)) rgPlayerMap.set(r.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
          rgPlayerMap.get(r.user_id)!.pickupLeagueIds.add(r.league_id)
        }
      }

      // Add confirmed game subs across all in-window games
      const allOrgGameIds = orgGamesInWindow.map(g => g.id as string)
      if (allOrgGameIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: subRows } = await (supabase as any)
          .from('game_subs')
          .select('user_id, game_id, profiles!game_subs_user_id_fkey(email, full_name, email_reminders_enabled)')
          .eq('organization_id', orgId).eq('status', 'confirmed').not('user_id', 'is', null).in('game_id', allOrgGameIds)
        for (const s of subRows ?? []) {
          const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles as { email?: string; full_name?: string; email_reminders_enabled?: boolean } | null
          if (!p?.email || p?.email_reminders_enabled === false || !s.user_id || !s.game_id) continue
          if (!rgPlayerMap.has(s.user_id)) rgPlayerMap.set(s.user_id, { email: p.email, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
          rgPlayerMap.get(s.user_id)!.subGameIds.add(s.game_id)
        }
      }

      if (rgPlayerMap.size === 0) continue

      // Process each local date group separately — one digest email per player per date
      for (const [gameLocalDate, gamesForDate] of gamesByDate) {
        const rgUserIds = [...rgPlayerMap.keys()]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rgSentForDate } = await (supabase as any)
          .from('player_email_reminder_logs')
          .select('user_id')
          .eq('organization_id', orgId)
          .eq('log_date', gameLocalDate)
          .in('user_id', rgUserIds)
        const rgAlreadySent = new Set((rgSentForDate ?? []).map((r: { user_id: string }) => r.user_id))

        const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' })
          .format(new Date(gamesForDate[0].scheduled_at))
        // "tomorrow" / "today" / specific date label for the subject line
        const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)
        const dayLabel = gameLocalDate === new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(now.getTime() + 86400000))
          ? 'tomorrow'
          : gameLocalDate === todayLocal ? 'today' : `on ${dateLabel}`

        const orgSlug = rgOrgSlugById.get(orgId) ?? ''
        const profileUrl = orgSlug ? `https://${orgSlug}.${PLATFORM_DOMAIN}/profile` : `https://app.${PLATFORM_DOMAIN}/profile`

        for (const [userId, player] of rgPlayerMap) {
          if (rgAlreadySent.has(userId)) continue

          const myGames = gamesForDate.filter(g => {
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
            .insert({ user_id: userId, organization_id: orgId, log_date: gameLocalDate })
          if (rgClaimErr) {
            if (rgClaimErr.code === '23505') continue // concurrent run already claimed
            results.push(`email reminder log error for ${userId}: ${rgClaimErr.message}`)
            continue
          }

          const firstName = player.name.split(' ')[0] || 'there'
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
            ? `Game reminder: you have a game ${dayLabel}`
            : `Game reminder: you have ${myGames.length} games ${dayLabel}`

          reminderEmailBatch.push({
            from: FROM_EMAIL,
            to: player.email,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="margin-top:0">Hi ${firstName}, you have ${myGames.length === 1 ? 'a game' : `${myGames.length} games`} ${dayLabel}!</h2>
              <p style="color:#555;margin-bottom:16px">${dateLabel}</p>
              <table style="width:100%;border-collapse:collapse">${gameRows}</table>
              <p style="margin-top:24px;font-size:12px;color:#999;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.6;">
                You&rsquo;re receiving this because you&rsquo;re registered with <strong>${orgName}</strong>, powered by Fieldday.<br>
                To stop receiving game reminders, update your <a href="${profileUrl}" style="color:#999">notification preferences</a> in your profile.
              </p>
            </div>`,
          })

          results.push(`email reminder queued for ${userId} (${myGames.length} game${myGames.length !== 1 ? 's' : ''} on ${gameLocalDate})`)
        }
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
    id: string; organization_id: string; scheduled_at: string; league_id: string | null
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
    // Fetch org names + timezones for all orgs that have reminders configured
    const orgIds = [...remindersByOrg.keys()]
    const [{ data: orgRows }, { data: smsBranding }] = await Promise.all([
      supabase.from('organizations').select('id, name').in('id', orgIds),
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', orgIds),
    ])
    const orgNameById = new Map((orgRows ?? []).map(o => [o.id, o.name]))
    const orgTimezoneById = new Map((smsBranding ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))

    // Fetch all upcoming games in the next 24h (widest possible reminder window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: smsGames, error: gamesErr } = await (supabase as any)
      .from('games')
      .select('id, organization_id, scheduled_at, league_id, home_team_id, away_team_id, court, leagues(name, sport)')
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
      const timezone = orgTimezoneById.get(orgId) ?? 'America/Toronto'
      const gameTime = new Date(game.scheduled_at).toLocaleTimeString('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
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
        // Pickup/drop-in games have no teams — recipients come from league registrations instead.
        const isPickup = teamIds.length === 0
        if (isPickup && !game.league_id) {
          // No teams and no league — skip the log insert so it retries when teams are added
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

        let allPlayers: ({ phone?: string | null; sms_opted_in?: boolean | null } | null)[]
        if (isPickup) {
          // Pickup game: gather opted-in registrants of the game's league
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pickupRegRows } = await (supabase as any)
            .from('registrations')
            .select('user_id')
            .eq('league_id', game.league_id)
            .in('status', ['active', 'pending'])
          const pickupUserIds = [...new Set((pickupRegRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))]
          if (pickupUserIds.length === 0) {
            skipReasons.push(`${reminder.minutes_before}min:no_pickup_registrants`)
            continue
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pickupProfiles } = await (supabase as any)
            .from('profiles')
            .select('phone, sms_opted_in')
            .in('id', pickupUserIds)
          allPlayers = (pickupProfiles ?? []) as ({ phone?: string | null; sms_opted_in?: boolean | null })[]
        } else {
          const { data: members } = await supabase
            .from('team_members')
            .select('profiles!team_members_user_id_fkey(phone, sms_opted_in)')
            .in('team_id', teamIds)

          allPlayers = (members ?? [])
            .flatMap(m => (Array.isArray(m.profiles) ? m.profiles : [m.profiles]))
            .filter(Boolean)
        }

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
      id, organization_id, scheduled_at, court, league_id,
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
      id: string; organization_id: string; scheduled_at: string; court: string | null; league_id: string | null
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
      // Pickup/drop-in games have no teams — recipients come from league registrations instead.
      const pickupLeagueIds = [...new Set(
        orgGames.filter(g => !g.home_team && !g.away_team && g.league_id).map(g => g.league_id as string)
      )]
      if (teamIds.length === 0 && pickupLeagueIds.length === 0) continue

      // Build map: user_id → { phone, name, teamIds[], subGameIds[], pickupLeagueIds[] }
      type PlayerEntry = { phone: string; name: string; teamIds: Set<string>; subGameIds: Set<string>; pickupLeagueIds: Set<string> }
      const playerMap = new Map<string, PlayerEntry>()

      // Get opted-in players with game-day SMS enabled
      if (teamIds.length > 0) {
        const { data: members } = await supabase
          .from('team_members')
          .select('user_id, team_id, profiles!team_members_user_id_fkey(phone, full_name, sms_opted_in, sms_game_day_enabled)')
          .in('team_id', teamIds)

        for (const m of members ?? []) {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!p?.phone || !(p as any)?.sms_opted_in || !(p as any)?.sms_game_day_enabled) continue
          if (!m.team_id || !m.user_id) continue
          const userId = m.user_id
          const teamId = m.team_id
          if (!playerMap.has(userId)) {
            playerMap.set(userId, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
          }
          playerMap.get(userId)!.teamIds.add(teamId)
        }
      }

      // Include opted-in registrants of pickup leagues with games today
      if (pickupLeagueIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pickupRegRows } = await (supabase as any)
          .from('registrations')
          .select('user_id, league_id')
          .in('league_id', pickupLeagueIds)
          .in('status', ['active', 'pending'])
        const pickupUserIds = [...new Set((pickupRegRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))]
        if (pickupUserIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pickupProfiles } = await (supabase as any)
            .from('profiles')
            .select('id, phone, full_name, sms_opted_in, sms_game_day_enabled')
            .in('id', pickupUserIds)
          type PProfile = { id: string; phone?: string | null; full_name?: string | null; sms_opted_in?: boolean | null; sms_game_day_enabled?: boolean | null }
          const pProfileById = new Map<string, PProfile>((pickupProfiles ?? []).map((p: PProfile) => [p.id, p]))
          for (const r of (pickupRegRows ?? []) as { user_id: string; league_id: string }[]) {
            if (!r.user_id || !r.league_id) continue
            const p = pProfileById.get(r.user_id)
            if (!p?.phone || !p?.sms_opted_in || !p?.sms_game_day_enabled) continue
            if (!playerMap.has(r.user_id)) {
              playerMap.set(r.user_id, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
            }
            playerMap.get(r.user_id)!.pickupLeagueIds.add(r.league_id)
          }
        }
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
            playerMap.set(s.user_id, { phone: p.phone, name: p.full_name ?? '', teamIds: new Set(), subGameIds: new Set(), pickupLeagueIds: new Set() })
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
        const myGames = orgGames.filter(g => {
          const isPickupGame = !g.home_team && !g.away_team
          if (isPickupGame) return g.league_id ? player.pickupLeagueIds.has(g.league_id) : false
          return (g.home_team?.id && player.teamIds.has(g.home_team.id)) ||
            (g.away_team?.id && player.teamIds.has(g.away_team.id)) ||
            player.subGameIds.has(g.id as string)
        }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

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

        const smsBody = `${orgName}\n\n${intro}\n\n${gameLines.join('\n\n')}\n\nView your schedule: ${scheduleUrl}\n\nReply STOP to unsubscribe.`

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

  // 6b. Captain prep email — 48 h before event start.
  //     Emails captains/coaches a full roster-status digest (registered, needs
  //     waiver, not registered, invited-pending) plus invite instructions.
  //     One email per team per league, deduped via league_captain_prep_logs.
  //     Only fires for orgs that have captain_prep_email_enabled = true.
  const prepEmails: Array<{ from: string; to: string; subject: string; html: string }> = []

  // 48h-ahead query window, widened to cover all timezones; narrowed per-org below.
  const cp48Start = new Date(now.getTime() + 42 * 60 * 60 * 1000).toISOString().split('T')[0]
  const cp48End   = new Date(now.getTime() + 54 * 60 * 60 * 1000).toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cpLeagues } = await (supabase as any)
    .from('leagues')
    .select('id, name, slug, organization_id, season_start_date, waiver_version_id, venue_name, venue_address')
    .in('status', ['active', 'registration_open'])
    .not('season_start_date', 'is', null)
    .gte('season_start_date', cp48Start)
    .lte('season_start_date', cp48End)

  if ((cpLeagues ?? []).length > 0) {
    const cpOrgIds = [...new Set((cpLeagues as { organization_id: string }[]).map(l => l.organization_id))]

    const [{ data: cpBranding }, { data: cpOrgs }, { data: cpNotif }] = await Promise.all([
      supabase.from('org_branding').select('organization_id, timezone').in('organization_id', cpOrgIds),
      supabase.from('organizations').select('id, name, slug').in('id', cpOrgIds),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('org_notification_settings')
        .select('organization_id, captain_prep_email_enabled')
        .in('organization_id', cpOrgIds),
    ])

    const cpTzByOrg   = new Map((cpBranding ?? []).map(b => [b.organization_id, b.timezone ?? 'America/Toronto']))
    const cpOrgById   = new Map((cpOrgs ?? []).map(o => [o.id, { name: o.name, slug: o.slug }]))
    const cpEnabledByOrg = new Map((cpNotif ?? []).map((s: { organization_id: string; captain_prep_email_enabled: boolean }) => [s.organization_id, s.captain_prep_email_enabled]))

    type CPLeague = {
      id: string; name: string; slug: string; organization_id: string
      season_start_date: string; waiver_version_id: string | null
      venue_name: string | null; venue_address: string | null
    }

    for (const league of (cpLeagues as CPLeague[]) ?? []) {
      // Org must have the prep email enabled
      if (cpEnabledByOrg.get(league.organization_id) !== true) continue

      const timezone = cpTzByOrg.get(league.organization_id) ?? 'America/Toronto'

      // Fire only when the event start is exactly 2 days away in the org's local timezone
      const twoDaysOut = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
        .format(new Date(now.getTime() + 48 * 60 * 60 * 1000))
      if (league.season_start_date !== twoDaysOut) continue

      const orgInfo = cpOrgById.get(league.organization_id)
      const orgName = orgInfo?.name ?? 'Fieldday'
      const orgSlug = orgInfo?.slug ?? ''
      const requiresWaiver = !!league.waiver_version_id

      const dateLabel = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
      }).format(new Date(`${league.season_start_date}T12:00:00`))

      // Teams in this league
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cpTeams } = await (supabase as any)
        .from('teams').select('id, name')
        .eq('league_id', league.id).eq('organization_id', league.organization_id).eq('status', 'active')
      if (!cpTeams || cpTeams.length === 0) continue
      const teamIds = (cpTeams as { id: string; name: string }[]).map(t => t.id)

      // Members, registrations (with waiver status), pending invitations, and prior logs
      const [{ data: cpMembers }, { data: cpRegs }, { data: cpInvites }, { data: cpLogs }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('team_members')
          .select('team_id, user_id, role, profiles!team_members_user_id_fkey(full_name, email)')
          .in('team_id', teamIds).eq('status', 'active'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('registrations')
          .select('user_id, status, waiver_signature_id')
          .eq('league_id', league.id).eq('organization_id', league.organization_id)
          .in('status', ['active', 'pending']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('team_invitations')
          .select('team_id, invited_email, role, status')
          .in('team_id', teamIds).eq('status', 'pending'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('league_captain_prep_logs')
          .select('team_id').eq('league_id', league.id).in('team_id', teamIds),
      ])

      // registration lookup: user_id → { signed }
      const regByUser = new Map<string, { signed: boolean }>()
      for (const r of (cpRegs ?? []) as { user_id: string; waiver_signature_id: string | null }[]) {
        if (r.user_id) regByUser.set(r.user_id, { signed: !!r.waiver_signature_id })
      }

      const alreadySent = new Set((cpLogs ?? []).map((l: { team_id: string }) => l.team_id))

      type CPMember = { team_id: string; user_id: string; role: string; profiles: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null }
      const membersByTeam = new Map<string, CPMember[]>()
      for (const m of (cpMembers ?? []) as CPMember[]) {
        if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, [])
        membersByTeam.get(m.team_id)!.push(m)
      }
      const invitesByTeam = new Map<string, { invited_email: string }[]>()
      for (const inv of (cpInvites ?? []) as { team_id: string; invited_email: string }[]) {
        if (!invitesByTeam.has(inv.team_id)) invitesByTeam.set(inv.team_id, [])
        invitesByTeam.get(inv.team_id)!.push({ invited_email: inv.invited_email })
      }

      for (const team of (cpTeams as { id: string; name: string }[])) {
        if (alreadySent.has(team.id)) continue

        const members = membersByTeam.get(team.id) ?? []
        const leaders = members.filter(m => ['captain', 'coach'].includes(m.role))
        if (leaders.length === 0) continue

        const registered: PrepPlayer[] = []
        const needsWaiver: PrepPlayer[] = []
        const notRegistered: PrepPlayer[] = []

        for (const m of members) {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const player: PrepPlayer = { name: p?.full_name ?? p?.email ?? 'Unknown Player', email: p?.email ?? null }
          const reg = m.user_id ? regByUser.get(m.user_id) : undefined
          if (!reg) {
            notRegistered.push(player)
          } else if (requiresWaiver && !reg.signed) {
            needsWaiver.push(player)
          } else {
            registered.push(player)
          }
        }

        const invitedPending: PrepPlayer[] = (invitesByTeam.get(team.id) ?? [])
          .map(inv => ({ name: inv.invited_email, email: null }))

        // Claim the send slot (dedup) before building/sending
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: logErr } = await (supabase as any)
          .from('league_captain_prep_logs')
          .insert({ league_id: league.id, team_id: team.id })
        if (logErr) {
          if (logErr.code === '23505') continue
          results.push(`captain prep log error team ${team.id}: ${logErr.message}`)
          continue
        }

        const { subject, html } = buildCaptainPrepEmail({
          orgName, orgSlug, platformDomain,
          leagueName: league.name, leagueSlug: league.slug,
          teamName: team.name, teamId: team.id,
          dateLabel,
          venueName: league.venue_name, venueAddress: league.venue_address,
          registered, needsWaiver, notRegistered, invitedPending,
        })

        for (const leader of leaders) {
          const p = Array.isArray(leader.profiles) ? leader.profiles[0] : leader.profiles
          if (!p?.email) continue
          prepEmails.push({ from: FROM_EMAIL, to: p.email, subject, html })
        }
        results.push(`captain prep queued for team ${team.id} (${leaders.length} leader${leaders.length !== 1 ? 's' : ''})`)
      }
    }
  }

  // Flush captain prep batch
  if (prepEmails.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (resend.batch as any).send(prepEmails)
      .catch((e: unknown) => results.push(`captain prep batch error: ${e}`))
    results.push(`captain prep batch: ${prepEmails.length} email(s) dispatched`)
  }

  // 7. Trial expiring alerts — fire once when trial_end is exactly 3 days away
  //    Uses a platform_settings log key to ensure we alert only once per org.
  const trialAlertThresholdMs = 3 * 24 * 60 * 60 * 1000  // 3 days
  const trialWindowStart = new Date(now.getTime() + trialAlertThresholdMs - 15 * 60 * 1000) // ±15min cron window
  const trialWindowEnd   = new Date(now.getTime() + trialAlertThresholdMs + 15 * 60 * 1000)

  const { data: expiringTrials } = await supabase
    .from('subscriptions')
    .select('organization_id, trial_end')
    .eq('status', 'trialing')
    .gte('trial_end', trialWindowStart.toISOString())
    .lte('trial_end', trialWindowEnd.toISOString())

  for (const trial of expiringTrials ?? []) {
    // Dedup: skip if we already sent an alert for this org's trial
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('platform_settings')
      .select('value')
      .eq('key', `trial_alert_sent_${trial.organization_id}`)
      .single()
    if (existing) continue

    // Fetch org name for the alert
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', trial.organization_id)
      .single()

    const trialEnd = trial.trial_end
      ? new Date(trial.trial_end).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'soon'
    const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
    const orgUrl = `https://app.${PLATFORM_DOMAIN}/super/orgs/${trial.organization_id}`

    await sendPlatformAlert(
      'trial_expiring',
      `Trial expiring in 3 days: ${orgRow?.name ?? trial.organization_id}`,
      `<div style="font-family:sans-serif;max-width:560px;color:#111;">
        <h2 style="font-size:18px;">Trial expiring soon</h2>
        <p><strong>${orgRow?.name ?? 'Unknown org'}</strong> (${orgRow?.slug ?? ''}) has a trial that expires on <strong>${trialEnd}</strong> (3 days from now).</p>
        <p>If they haven't subscribed by then, their account will drop to the Free plan limits.</p>
        <a href="${orgUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View in Super Console →</a>
      </div>`
    )

    // Mark as sent so we don't fire again on the next cron run
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('platform_settings')
      .upsert({ key: `trial_alert_sent_${trial.organization_id}`, value: now.toISOString(), updated_at: now.toISOString() }, { onConflict: 'key' })

    results.push(`trial expiry alert sent for org ${trial.organization_id}`)
  }

  // 8. Trial expiry enforcement — downgrade orgs whose trial has ended without subscribing.
  //    Runs on every cron tick; the update is idempotent so duplicate runs are harmless.
  const { data: expiredTrials } = await supabase
    .from('subscriptions')
    .select('organization_id, plan_tier, trial_end')
    .eq('status', 'trialing')
    .lt('trial_end', now.toISOString())

  for (const trial of expiredTrials ?? []) {
    // Downgrade to free plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: downgradeErr } = await (supabase as any)
      .from('subscriptions')
      .update({
        plan_tier: 'free',
        status: 'active',
        trial_end: null,
        updated_at: now.toISOString(),
      })
      .eq('organization_id', trial.organization_id)

    if (downgradeErr) {
      results.push(`trial expiry downgrade error for ${trial.organization_id}: ${downgradeErr.message}`)
      continue
    }

    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', trial.organization_id)
      .single()

    const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
    const orgName = orgRow?.name ?? 'Your organization'
    const orgSlug = orgRow?.slug ?? ''
    const billingUrl = `https://${orgSlug}.${PLATFORM_DOMAIN}/admin/settings/billing`
    const orgUrl    = `https://app.${PLATFORM_DOMAIN}/super/orgs/${trial.organization_id}`

    // Notify the org's admin(s)
    const { data: orgAdmins } = await supabase
      .from('org_members')
      .select('profiles!org_members_user_id_fkey(email, full_name)')
      .eq('organization_id', trial.organization_id)
      .eq('role', 'org_admin')
      .eq('status', 'active')

    const adminEmails = (orgAdmins ?? [])
      .flatMap((m: { profiles: unknown }) => Array.isArray(m.profiles) ? m.profiles : [m.profiles])
      .filter((p): p is { email: string; full_name: string } => !!p && !!(p as { email?: string }).email)

    for (const admin of adminEmails) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: admin.email,
        subject: `Your Fieldday trial has ended — ${orgName}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
          <h2 style="margin-top:0;">Your free trial has ended</h2>
          <p>Hi ${admin.full_name?.split(' ')[0] || 'there'},</p>
          <p>Your 15-day free trial for <strong>${orgName}</strong> has ended. Your account has been moved to the <strong>Free plan</strong>, which includes:</p>
          <ul style="color:#374151;line-height:1.8;">
            <li>1 active league</li>
            <li>Up to 50 players</li>
            <li>Online registration &amp; payments</li>
            <li>Schedule, standings &amp; RSVP</li>
          </ul>
          <p>Your data is fully preserved. To restore access to all your leagues and paid features, subscribe from your billing page.</p>
          <a href="${billingUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;margin:8px 0;">
            Choose a plan →
          </a>
          <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px;">
            Questions? Reply to this email or visit <a href="https://fielddayapp.ca" style="color:#9ca3af;">fielddayapp.ca</a>.
          </p>
        </div>`,
      }).catch(() => {})
    }

    // Alert platform admins
    await sendPlatformAlert(
      'subscription_change',
      `Trial ended — ${orgName} moved to Free`,
      `<div style="font-family:sans-serif;max-width:560px;color:#111;">
        <h2>Trial expired — downgraded to Free</h2>
        <p><strong>${orgName}</strong> (${orgSlug}) did not subscribe before their trial ended. They have been automatically moved to the <strong>Free plan</strong>.</p>
        <p style="color:#6b7280;font-size:13px;">Previous plan: ${trial.plan_tier}</p>
        <a href="${orgUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">View in Super Console →</a>
      </div>`
    )

    results.push(`trial expired — ${trial.organization_id} (${orgName}) downgraded to free`)
  }

  // 9. Auto-purge events soft-deleted more than 30 days ago
  const purgeCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: toPurge } = await (supabase as any)
    .from('leagues')
    .select('id, organization_id, name')
    .not('deleted_at', 'is', null)
    .lte('deleted_at', purgeCutoff)
  for (const lg of toPurge ?? []) {
    const res = await purgeLeagueData(lg.organization_id, lg.id, null, 'System (auto-purge)')
      .catch((e: unknown) => ({ error: String(e) }))
    if (res?.error) results.push(`auto-purge error for league ${lg.id}: ${res.error}`)
    else results.push(`auto-purged trashed event ${lg.id} (${lg.name})`)
  }

  // 10. YouTube auto-sync — uploads → moderation queue, + live detection.
  //     Cheap quota usage (~2 units/channel/run via playlistItems + videos).
  if (process.env.YOUTUBE_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ytConns } = await (supabase as any)
      .from('social_connections')
      .select('id, organization_id, external_account_id, uploads_playlist_id, sync_enabled, live_sync_enabled')
      .eq('platform', 'youtube')
      .eq('sync_enabled', true)

    for (const conn of ytConns ?? []) {
      if (!conn.uploads_playlist_id) continue
      const videos = await fetchRecentUploads(conn.uploads_playlist_id, 15)
      if (videos.length === 0) continue

      // Upsert each upload into the moderation queue (approved=false on first sight)
      for (const v of videos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('social_media_items')
          .upsert(
            {
              organization_id: conn.organization_id,
              connection_id: conn.id,
              platform: 'youtube',
              external_id: v.videoId,
              type: 'video',
              media_url: youTubeWatchUrl(v.videoId),
              embed_url: youTubeEmbedUrl(v.videoId),
              thumbnail_url: v.thumbnailUrl,
              caption: v.title,
              posted_at: v.publishedAt,
            },
            { onConflict: 'organization_id,platform,external_id', ignoreDuplicates: true }
          )
      }

      // Live detection — a currently-live broadcast shows liveBroadcastContent='live'
      if (conn.live_sync_enabled) {
        const liveVid = videos.find(v => v.liveBroadcastContent === 'live')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingApiLive } = await (supabase as any)
          .from('live_streams')
          .select('id, url')
          .eq('organization_id', conn.organization_id)
          .eq('status', 'live')
          .eq('detected_via', 'api')
          .maybeSingle()

        if (liveVid) {
          const watch = youTubeWatchUrl(liveVid.videoId)
          if (!existingApiLive) {
            // Don't override a manual live stream that's currently active
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: manualLive } = await (supabase as any)
              .from('live_streams').select('id').eq('organization_id', conn.organization_id)
              .eq('status', 'live').eq('detected_via', 'manual').maybeSingle()
            if (!manualLive) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from('live_streams').insert({
                organization_id: conn.organization_id,
                platform: 'youtube',
                title: liveVid.title,
                url: watch,
                embed_url: `${youTubeEmbedUrl(liveVid.videoId)}?autoplay=1`,
                status: 'live',
                detected_via: 'api',
              })
              results.push(`youtube live detected for org ${conn.organization_id}`)
            }
          }
        } else if (existingApiLive) {
          // Stream ended → clear the api-detected live row
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('live_streams')
            .update({ status: 'ended', ended_at: now.toISOString() })
            .eq('id', existingApiLive.id)
          results.push(`youtube live ended for org ${conn.organization_id}`)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('social_connections')
        .update({ last_synced_at: now.toISOString() }).eq('id', conn.id)
      results.push(`youtube synced ${videos.length} video(s) for org ${conn.organization_id}`)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Session reminders — pickup/drop-in event sessions (day before)
  //   event_sessions are NOT games, so none of the game-reminder paths above
  //   cover them. Sends one email + SMS per registered player per session, the
  //   day before (org-local date). Deduped via session_reminder_logs.
  // ──────────────────────────────────────────────────────────────────────────
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdb = supabase as any
    const SESSION_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
    const sessionWindowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    const { data: upcomingSessions } = await sdb
      .from('event_sessions')
      .select('id, league_id, organization_id, scheduled_at, location_override, leagues(name, sport)')
      .eq('status', 'open')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', sessionWindowEnd.toISOString())

    type SessionRow = {
      id: string; league_id: string; organization_id: string; scheduled_at: string
      location_override: string | null
      leagues: { name: string; sport?: string | null } | { name: string; sport?: string | null }[] | null
    }
    const sessions = (upcomingSessions ?? []) as SessionRow[]

    if (sessions.length > 0) {
      const sOrgIds = [...new Set(sessions.map(s => s.organization_id))]
      const [{ data: sBranding }, { data: sOrgs }, { data: sNotif }] = await Promise.all([
        sdb.from('org_branding').select('organization_id, timezone').in('organization_id', sOrgIds),
        sdb.from('organizations').select('id, name, slug').in('id', sOrgIds),
        sdb.from('org_notification_settings')
          .select('organization_id, email_game_reminders_enabled, sms_game_reminders_enabled')
          .in('organization_id', sOrgIds),
      ])
      const sTzByOrg = new Map<string, string>((sBranding ?? []).map((b: { organization_id: string; timezone: string | null }) => [b.organization_id, b.timezone ?? 'America/Toronto']))
      const sNameByOrg = new Map<string, string>((sOrgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]))
      const sSlugByOrg = new Map<string, string>((sOrgs ?? []).map((o: { id: string; slug: string }) => [o.id, o.slug]))
      const sEmailOnByOrg = new Map<string, boolean>((sNotif ?? []).map((s: { organization_id: string; email_game_reminders_enabled: boolean | null }) => [s.organization_id, s.email_game_reminders_enabled ?? true]))
      const sSmsOnByOrg = new Map<string, boolean>((sNotif ?? []).map((s: { organization_id: string; sms_game_reminders_enabled: boolean | null }) => [s.organization_id, s.sms_game_reminders_enabled ?? true]))

      // Keep only sessions whose local (org tz) calendar date is "tomorrow"
      const tomorrowSessions = sessions.filter(s => {
        const tz = sTzByOrg.get(s.organization_id) ?? 'America/Toronto'
        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(s.scheduled_at))
        const tomorrowLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(now.getTime() + 86400000))
        return localDate === tomorrowLocal
      })

      const sessionEmailBatch: Array<{ from: string; to: string; subject: string; html: string }> = []

      for (const session of tomorrowSessions) {
        const orgId = session.organization_id
        const tz = sTzByOrg.get(orgId) ?? 'America/Toronto'
        const orgName = sNameByOrg.get(orgId) ?? 'Fieldday'
        const orgSlug = sSlugByOrg.get(orgId) ?? ''
        const emailOn = sEmailOnByOrg.get(orgId) !== false
        const smsOn = sSmsOnByOrg.get(orgId) !== false
        const league = Array.isArray(session.leagues) ? session.leagues[0] : session.leagues
        const eventName = league?.name ?? 'Pickup session'
        const profileUrl = orgSlug ? `https://${orgSlug}.${SESSION_DOMAIN}/profile` : `https://app.${SESSION_DOMAIN}/profile`

        const sessDate = new Date(session.scheduled_at)
        const timeLabel = sessDate.toLocaleTimeString('en-CA', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(sessDate)
        const locationLabel = session.location_override || formatCourtLabel(null, league?.sport) || ''

        // Registered players for this session
        const { data: regRows } = await sdb
          .from('session_registrations')
          .select('user_id')
          .eq('session_id', session.id)
          .eq('status', 'registered')
        const userIds = [...new Set((regRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))] as string[]
        if (userIds.length === 0) continue

        // Who has already been reminded for this session
        const { data: sentRows } = await sdb
          .from('session_reminder_logs')
          .select('user_id')
          .eq('session_id', session.id)
          .in('user_id', userIds)
        const alreadySent = new Set((sentRows ?? []).map((r: { user_id: string }) => r.user_id))

        const { data: sProfiles } = await sdb
          .from('profiles')
          .select('id, email, full_name, email_reminders_enabled, phone, sms_opted_in')
          .in('id', userIds)
        type SProfile = { id: string; email?: string | null; full_name?: string | null; email_reminders_enabled?: boolean | null; phone?: string | null; sms_opted_in?: boolean | null }

        for (const p of (sProfiles ?? []) as SProfile[]) {
          if (alreadySent.has(p.id)) continue

          // Claim the slot atomically — UNIQUE(session_id, user_id) prevents dup sends across runs
          const { error: claimErr } = await sdb
            .from('session_reminder_logs')
            .insert({ session_id: session.id, user_id: p.id })
          if (claimErr) {
            if (claimErr.code === '23505') continue // already claimed by a concurrent run
            results.push(`session reminder log error for ${p.id}: ${claimErr.message}`)
            continue
          }

          const firstName = (p.full_name ?? '').split(' ')[0] || 'there'
          const venueLine = locationLabel ? ` · ${locationLabel}` : ''

          // Email
          if (emailOn && p.email && p.email_reminders_enabled !== false) {
            sessionEmailBatch.push({
              from: FROM_EMAIL,
              to: p.email,
              subject: `Reminder: ${eventName} tomorrow`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="margin-top:0">Hi ${firstName}, you're signed up for ${eventName} tomorrow!</h2>
                <p style="color:#555;margin-bottom:16px">${dateLabel}</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0"><strong>${timeLabel}</strong>${locationLabel ? `<br><span style="color:#666;font-size:13px">${locationLabel}</span>` : ''}</td></tr>
                </table>
                <p style="margin-top:24px;font-size:12px;color:#999;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.6;">
                  You&rsquo;re receiving this because you&rsquo;re registered with <strong>${orgName}</strong>, powered by Fieldday.<br>
                  To stop receiving reminders, update your <a href="${profileUrl}" style="color:#999">notification preferences</a> in your profile.
                </p>
              </div>`,
            })
            results.push(`session email queued for ${p.id} (session ${session.id})`)
          }

          // SMS
          if (smsOn && p.phone && p.sms_opted_in) {
            const smsBody = `${orgName} – ${eventName}\n\nReminder: you're signed up for tomorrow${venueLine} · ${timeLabel}\n\nReply STOP to unsubscribe.`
            try {
              await sendSms(p.phone, smsBody)
              results.push(`session sms sent to ${p.id} (session ${session.id})`)
            } catch (e) {
              results.push(`session sms error for ${p.id}: ${e}`)
            }
          }
        }
      }

      if (sessionEmailBatch.length > 0) {
        const EMAIL_BATCH_SIZE = 100
        for (let i = 0; i < sessionEmailBatch.length; i += EMAIL_BATCH_SIZE) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (resend.batch as any).send(sessionEmailBatch.slice(i, i + EMAIL_BATCH_SIZE))
            .catch((e: unknown) => results.push(`session email batch error: ${e}`))
        }
        results.push(`session reminder batch: ${sessionEmailBatch.length} email(s) dispatched`)
      }
    }
  }

  return NextResponse.json({ ok: true, processed: results, sms_diagnostics })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 })
  }
}
