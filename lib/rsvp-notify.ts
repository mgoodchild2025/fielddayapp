// Who hears about an RSVP change, and when.
//
// Pure, so the routing is unit-tested rather than reasoned about inside the
// action that talks to the database. Four rules live here:
//
//  1. Only a real change raises an alert. A first "in" is routine and a repeat
//     tap of the same answer is noise; "out" and "back in" are the two changes
//     a team manager actually needs to plan around.
//  2. Whoever was told a player is out is told when they come back in. Without
//     that, a captain is left planning around a player who is actually coming.
//  3. Team managers are captains AND coaches — the same pair the team page and
//     requireCaptainOrCoach treat as managers. A coach-run team was getting no
//     team-level alert at all.
//  4. Admins hear only about events they organize. Every event's creator is an
//     organizer automatically and co-organizers are invited explicitly, so
//     organizers are exactly the people running it. Previously every admin in
//     the org was pinged for every absence in every league. If an event has no
//     organizer (older events), org admins are the fallback so the alert is
//     never silently dropped.
//
// SMS routing is not decided here: it reuses decideReminderChannels, so an
// RSVP alert follows the same push-first rule as every reminder.

export type RsvpStatus = 'in' | 'out'
export type RsvpAlert = 'out' | 'back_in'

/** Team roles that manage a roster. */
export const TEAM_MANAGER_ROLES = ['captain', 'coach'] as const

/** Which alert, if any, moving from `previous` to `next` should raise. */
export function rsvpAlertFor(previous: RsvpStatus | null | undefined, next: RsvpStatus): RsvpAlert | null {
  if (next === 'out') return previous === 'out' ? null : 'out'
  // next === 'in': only news if they had said they were out.
  return previous === 'out' ? 'back_in' : null
}

/**
 * Everyone who gets the in-app alert: the team's managers plus the event's
 * organizers (or org admins when it has none), deduplicated, never the player.
 */
export function rsvpRecipients(input: {
  playerId: string
  managerIds: string[]
  organizerIds: string[]
  orgAdminIds: string[]
}): string[] {
  const admins = input.organizerIds.length > 0 ? input.organizerIds : input.orgAdminIds
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...input.managerIds, ...admins]) {
    if (!id || id === input.playerId || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Organizer rows only count while the person is still an active admin of the org. */
export function activeOrganizerIds(organizerUserIds: (string | null)[], activeAdminIds: Set<string>): string[] {
  return organizerUserIds.filter((id): id is string => !!id && activeAdminIds.has(id))
}

export interface RsvpMessageContext {
  playerName: string
  teamName: string | null | undefined
  opponent: string | null | undefined
  date: string
  time: string
  court: string | null | undefined
}

/** Title and body for either direction, so both read the same way. */
export function rsvpMessage(alert: RsvpAlert, c: RsvpMessageContext): { title: string; body: string } {
  const team = c.teamName ?? 'their team'
  const vs = c.opponent ? ` vs ${c.opponent}` : ''
  const where = c.court ? ` · ${c.court}` : ''
  const when = `on ${c.date} at ${c.time}${where}`
  if (alert === 'out') {
    return {
      title: `${c.playerName} is out`,
      body: `${c.playerName} has RSVP'd out for ${team}${vs} ${when}.`,
    }
  }
  return {
    title: `${c.playerName} is back in`,
    body: `${c.playerName} is back in for ${team}${vs} ${when}.`,
  }
}
