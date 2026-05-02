'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { parseLocalToUtc } from '@/lib/format-time'

const sessionFieldsSchema = z.object({
  scheduled_at: z.string().min(1, 'Date & time required'),
  duration_minutes: z.coerce.number().int().min(15).default(90),
  capacity: z.coerce.number().int().min(1).optional(),
  location_override: z.string().optional(),
  notes: z.string().optional(),
  // Recurrence — if repeat_days is provided, repeat_until is required
  repeat_days: z.array(z.number().int().min(0).max(6)).optional(), // 0=Sun…6=Sat
  repeat_until: z.string().optional(), // YYYY-MM-DD
})

/**
 * Build recurring UTC ISO timestamps for a weekly schedule.
 * Iterates calendar dates (timezone-independent), checks day-of-week,
 * and converts each matching local date+time to UTC using the org timezone.
 */
function buildRecurringDates(
  firstLocalDatetime: string, // "YYYY-MM-DDTHH:mm" — naive local time
  days: number[],             // 0=Sun…6=Sat
  untilLocalDate: string,     // "YYYY-MM-DD"
  timezone: string
): string[] {
  const sep = firstLocalDatetime.indexOf('T')
  const startDate = firstLocalDatetime.slice(0, sep)   // "YYYY-MM-DD"
  const timeStr = firstLocalDatetime.slice(sep + 1)    // "HH:mm"

  const daySet = new Set(days)
  const results: string[] = []

  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = untilLocalDate.split('-').map(Number)

  // Iterate UTC calendar-day boundaries — getUTCDay() is timezone-independent for dates
  let cur = new Date(Date.UTC(sy, sm - 1, sd))
  const end = new Date(Date.UTC(ey, em - 1, ed))

  while (cur <= end) {
    if (daySet.has(cur.getUTCDay())) {
      const y = cur.getUTCFullYear()
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
      const d = String(cur.getUTCDate()).padStart(2, '0')
      results.push(parseLocalToUtc(`${y}-${m}-${d}`, timeStr, timezone))
    }
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000)
  }
  return results
}

export async function createSession(
  leagueId: string,
  input: z.infer<typeof sessionFieldsSchema>
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const parsed = sessionFieldsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const d = parsed.data

  // Resolve org timezone so we correctly convert the naive local datetime input to UTC
  const supabaseForTz = await createServerClient()
  const { data: branding } = await supabaseForTz
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  const base = {
    league_id: leagueId,
    organization_id: org.id,
    duration_minutes: d.duration_minutes,
    capacity: d.capacity ?? null,
    location_override: d.location_override || null,
    notes: d.notes || null,
  }

  // d.scheduled_at is "YYYY-MM-DDTHH:mm" from datetime-local input — naive local time.
  // Convert to UTC using the org timezone.
  const sep = d.scheduled_at.indexOf('T')
  const datePart = d.scheduled_at.slice(0, sep)
  const timePart = d.scheduled_at.slice(sep + 1)

  let scheduledIsos: string[]
  if (d.repeat_days && d.repeat_days.length > 0 && d.repeat_until) {
    scheduledIsos = buildRecurringDates(d.scheduled_at, d.repeat_days, d.repeat_until, timezone)
    if (scheduledIsos.length === 0) return { error: 'No sessions fall in that date range for the selected days' }
  } else {
    scheduledIsos = [parseLocalToUtc(datePart, timePart, timezone)]
  }

  const rows = scheduledIsos.map((iso) => ({ ...base, scheduled_at: iso }))

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('event_sessions').insert(rows)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/sessions`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null, count: rows.length }
}

export async function updateSession(
  sessionId: string,
  leagueId: string,
  input: Omit<z.infer<typeof sessionFieldsSchema>, 'repeat_days' | 'repeat_until'>
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const parsed = sessionFieldsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const d = parsed.data
  const supabase = await createServerClient()

  // Resolve org timezone so the naive local datetime input is stored as correct UTC
  const { data: branding } = await supabase
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  const sep = d.scheduled_at.indexOf('T')
  const scheduledAtUtc = sep !== -1
    ? parseLocalToUtc(d.scheduled_at.slice(0, sep), d.scheduled_at.slice(sep + 1), timezone)
    : d.scheduled_at

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('event_sessions')
    .update({
      scheduled_at: scheduledAtUtc,
      duration_minutes: d.duration_minutes,
      capacity: d.capacity ?? null,
      location_override: d.location_override || null,
      notes: d.notes || null,
    })
    .eq('id', sessionId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/sessions`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function cancelSession(sessionId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('event_sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/sessions`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function deleteSession(sessionId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('event_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/sessions`)
  return { error: null }
}

export async function joinSession(sessionId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('pickup_join_policy')
    .eq('id', leagueId)
    .eq('organization_id', org.id)
    .single()

  if (league?.pickup_join_policy === 'private') {
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite } = await (db as any)
      .from('pickup_invites')
      .select('id')
      .eq('league_id', leagueId)
      .eq('email', user.email!.toLowerCase())
      .in('status', ['pending', 'accepted'])
      .maybeSingle()
    if (!invite) return { error: 'This event is invite only' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (supabase as any)
    .from('event_sessions')
    .select('id, capacity, status')
    .eq('id', sessionId)
    .eq('organization_id', org.id)
    .single()

  if (!session) return { error: 'Session not found' }
  if (session.status === 'cancelled') return { error: 'This session has been cancelled' }

  if (session.capacity !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('session_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'registered')

    if ((count ?? 0) >= session.capacity) return { error: 'This session is full' }
  }

  // Upsert: handles re-joining after cancelling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('session_registrations')
    .upsert(
      {
        session_id: sessionId,
        league_id: leagueId,
        organization_id: org.id,
        user_id: user.id,
        status: 'registered',
      },
      { onConflict: 'session_id,user_id' }
    )

  if (error) return { error: error.message }

  // Mark invite as accepted on first join
  if (league?.pickup_join_policy === 'private') {
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('pickup_invites')
      .update({ status: 'accepted' })
      .eq('league_id', leagueId)
      .eq('email', user.email!.toLowerCase())
      .eq('status', 'pending')
  }

  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function leaveSession(sessionId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('session_registrations')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}
