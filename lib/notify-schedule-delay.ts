import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendEmailBatch } from '@/lib/email'
import { formatGameTime } from '@/lib/format-time'

export interface DelayedEntry {
  teamIds: string[]      // home/away (or team1/team2) ids for this game/match
  newIso: string         // new scheduled_at (UTC ISO) after the shift
  court: string | null
}

/**
 * Notify every affected team that their remaining games/matches were pushed
 * back. Sends ONE digest per team member (in-app notification + email),
 * listing each of that team's updated times — all formatted in the org's
 * timezone.
 */
export async function notifyScheduleDelay(opts: {
  orgId: string
  leagueName: string
  minutes: number
  timezone: string
  entries: DelayedEntry[]
  kind: 'game' | 'match'
}): Promise<void> {
  const { orgId, leagueName, minutes, timezone, entries, kind } = opts
  if (entries.length === 0) return

  const db = createServiceRoleClient()

  // Build per-team list of updated times (sorted)
  const teamEntries = new Map<string, { iso: string; court: string | null }[]>()
  for (const e of entries) {
    for (const teamId of e.teamIds) {
      if (!teamId) continue
      if (!teamEntries.has(teamId)) teamEntries.set(teamId, [])
      teamEntries.get(teamId)!.push({ iso: e.newIso, court: e.court })
    }
  }
  const teamIds = [...teamEntries.keys()]
  if (teamIds.length === 0) return

  // Fetch all members for the affected teams in one query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: memberRows } = await (db as any)
    .from('team_members')
    .select('team_id, user_id, profile:profiles!team_members_user_id_fkey(full_name, email)')
    .in('team_id', teamIds)
    .eq('status', 'active')

  type MemberRow = { team_id: string; user_id: string; profile: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null }
  const membersByTeam = new Map<string, { userId: string; email?: string; name?: string }[]>()
  for (const m of (memberRows ?? []) as MemberRow[]) {
    if (!m.user_id) continue
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, [])
    membersByTeam.get(m.team_id)!.push({ userId: m.user_id, email: p?.email, name: p?.full_name })
  }

  const kindLabel = kind === 'match' ? 'matches' : 'games'
  const notifications: Record<string, unknown>[] = []
  const emails: { to: string; subject: string; html: string }[] = []
  const seenUser = new Set<string>()

  for (const [teamId, list] of teamEntries) {
    const members = membersByTeam.get(teamId) ?? []
    if (members.length === 0) continue

    // Sorted, de-duplicated time lines (a team has at most one game per slot)
    const lines = [...list]
      .sort((a, b) => a.iso.localeCompare(b.iso))
      .map((g) => {
        const { time, date } = formatGameTime(g.iso, timezone)
        const court = g.court ? ` · ${g.court}` : ''
        return { text: `${date} at ${time}${court}`, time, date, court }
      })

    const plainBody = `Your remaining ${kindLabel} today were pushed back ${minutes} minutes. Updated times:\n` +
      lines.map((l) => `• ${l.text}`).join('\n')

    const htmlList = lines.map((l) => `<li style="padding:2px 0">${l.date} at <strong>${l.time}</strong>${l.court}</li>`).join('')
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;font-size:22px;">Schedule update</h2>
      <p style="color:#374151;margin:0 0 16px;">
        Your remaining ${kindLabel} today${leagueName ? ` for <strong>${leagueName}</strong>` : ''} have been pushed back
        <strong>${minutes} minutes</strong>. Here are your updated times:
      </p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#111;">${htmlList}</ul>
      <p style="color:#6b7280;font-size:13px;margin:0;">Times shown in your league's local timezone.</p>
    </div>`

    for (const m of members) {
      // One notification/email per user even if they're on multiple affected teams
      if (seenUser.has(m.userId)) continue
      seenUser.add(m.userId)
      notifications.push({
        organization_id: orgId,
        user_id: m.userId,
        type: 'schedule_delayed',
        title: 'Schedule update',
        body: plainBody,
        data: { minutes },
      })
      if (m.email) emails.push({ to: m.email, subject: `Schedule update — ${kindLabel} pushed back ${minutes} min`, html })
    }
  }

  if (notifications.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('notifications').insert(notifications)
  }
  if (emails.length > 0) {
    await sendEmailBatch(emails)
  }
}
