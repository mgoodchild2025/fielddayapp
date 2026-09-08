/**
 * Which channels a scheduled reminder (night-before digest, game-day morning,
 * pre-game minutes, session) goes out on for one player. Pure, so the cron's
 * routing is unit-tested rather than reasoned about inside 1,600 lines.
 *
 * Rules:
 *  - Push (bell row + Web Push) whenever the player hasn't turned reminders
 *    off. Creating the bell row costs nothing; delivery only happens on phones
 *    that subscribed.
 *  - SMS exactly as before (org toggle, phone on file, opted in), EXCEPT that a
 *    player who can actually receive push for this org is skipped unless they
 *    asked to keep texts too. "Can actually receive" = the server has VAPID
 *    keys AND this player has a push subscription for this org.
 *  - Email is untouched by push: it doubles as the record.
 */

export interface ReminderPlayerPrefs {
  phone: string | null | undefined
  smsOptedIn: boolean | null | undefined
  pushRemindersEnabled: boolean | null | undefined
  smsAlsoWhenPush: boolean | null | undefined
}

export interface ReminderChannelContext {
  /** Org-level SMS toggle for this reminder kind (e.g. sms_game_reminders_enabled). */
  orgSmsEnabled: boolean
  /** Server can deliver push at all (VAPID configured). */
  pushConfigured: boolean
  /** This player holds ≥1 push subscription for this org. */
  hasPushSubscription: boolean
  /** Extra per-kind SMS gate, e.g. sms_game_day_enabled. Defaults to true. */
  smsKindEnabled?: boolean | null
}

export interface ReminderChannels {
  push: boolean
  sms: boolean
  /** Why SMS was skipped, for the cron's diagnostics. */
  smsSkip: 'org_disabled' | 'no_phone' | 'not_opted_in' | 'kind_disabled' | 'push_instead' | null
}

export function decideReminderChannels(prefs: ReminderPlayerPrefs, ctx: ReminderChannelContext): ReminderChannels {
  const push = prefs.pushRemindersEnabled !== false

  let sms = true
  let smsSkip: ReminderChannels['smsSkip'] = null
  if (!ctx.orgSmsEnabled) { sms = false; smsSkip = 'org_disabled' }
  else if (!prefs.phone) { sms = false; smsSkip = 'no_phone' }
  else if (!prefs.smsOptedIn) { sms = false; smsSkip = 'not_opted_in' }
  else if (ctx.smsKindEnabled === false) { sms = false; smsSkip = 'kind_disabled' }
  else if (push && ctx.pushConfigured && ctx.hasPushSubscription && !prefs.smsAlsoWhenPush) {
    sms = false; smsSkip = 'push_instead'
  }

  return { push, sms, smsSkip }
}
