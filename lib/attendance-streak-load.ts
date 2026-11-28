import type { createServiceRoleClient } from '@/lib/supabase/service'
import { attendanceStreak, type Activity, type AttendanceStreak } from '@/lib/attendance-streak'

type Db = ReturnType<typeof createServiceRoleClient>
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

const LOOKBACK_MS = 400 * 24 * 60 * 60 * 1000
const AHEAD_MS = 8 * 24 * 60 * 60 * 1000

/**
 * The signed-in player's attendance streak in this org (rules in
 * lib/attendance-streak.ts): their teams' games over the last ~13 months with
 * their RSVP, plus the drop-in sessions of events they've signed up for.
 * Never throws — a failed read just shows no streak.
 */
export async function loadAttendanceStreak(db: Db, orgId: string, userId: string, timeZone: string): Promise<AttendanceStreak | null> {
  try {
    const nowMs = Date.now()
    const from = new Date(nowMs - LOOKBACK_MS).toISOString()
    const to = new Date(nowMs + AHEAD_MS).toISOString()

    const [{ data: mem }, { data: outs }, { data: mySessions }] = await Promise.all([
      db.from('team_members').select('team_id')
        .eq('organization_id', orgId).eq('user_id', userId).in('status', ['active', 'inactive']),
      db.from('game_rsvps').select('game_id')
        .eq('organization_id', orgId).eq('user_id', userId).eq('status', 'out')
        .gte('created_at', new Date(nowMs - LOOKBACK_MS - 60 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1000),
      db.from('session_registrations')
        .select('session_id, league_id, event_sessions!inner(scheduled_at, status)')
        .eq('organization_id', orgId).eq('user_id', userId).eq('status', 'registered')
        .gte('event_sessions.scheduled_at', from).lt('event_sessions.scheduled_at', to)
        .neq('event_sessions.status', 'cancelled')
        .limit(1000),
    ])

    const activities: Activity[] = []
    const teamIds = [...new Set((mem ?? []).map((m) => m.team_id))]
    if (teamIds.length > 0) {
      const ids = teamIds.join(',')
      const { data: games } = await db.from('games')
        .select('id, scheduled_at')
        .eq('organization_id', orgId)
        .or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`)
        .not('status', 'in', '(cancelled,postponed)')
        .gte('scheduled_at', from).lt('scheduled_at', to)
        .limit(1000)
      const out = new Set((outs ?? []).map((r) => r.game_id))
      for (const g of games ?? []) if (g.scheduled_at) activities.push({ at: g.scheduled_at, attended: !out.has(g.id) })
    }

    // Drop-ins: every session of an event they've signed up for, between their
    // first and last sign-up, was a chance to play (after their last one they
    // just stopped coming — the streak then ends by going stale, not by a miss).
    const mine = new Set<string>()
    let firstAt: string | null = null
    let lastAt: string | null = null
    const leagues = new Set<string>()
    for (const r of mySessions ?? []) {
      const s = one(r.event_sessions as unknown) as { scheduled_at: string } | null
      if (!s) continue
      mine.add(r.session_id)
      leagues.add(r.league_id)
      activities.push({ at: s.scheduled_at, attended: true })
      if (!firstAt || s.scheduled_at < firstAt) firstAt = s.scheduled_at
      if (!lastAt || s.scheduled_at > lastAt) lastAt = s.scheduled_at
    }
    if (leagues.size > 0 && firstAt) {
      const { data: sessions } = await db.from('event_sessions')
        .select('id, scheduled_at')
        .eq('organization_id', orgId).in('league_id', [...leagues])
        .neq('status', 'cancelled')
        .gte('scheduled_at', firstAt).lte('scheduled_at', lastAt!)
        .limit(1000)
      for (const s of sessions ?? []) if (!mine.has(s.id)) activities.push({ at: s.scheduled_at, attended: false })
    }

    return attendanceStreak(activities, nowMs, timeZone)
  } catch (err) {
    console.error('[loadAttendanceStreak]', err)
    return null
  }
}
