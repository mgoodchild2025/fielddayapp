'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

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

function buildRecurringDates(
  firstAt: Date,
  days: number[],
  until: Date
): Date[] {
  const dates: Date[] = []
  const time = { h: firstAt.getHours(), m: firstAt.getMinutes() }
  const daySet = new Set(days)
  const cur = new Date(firstAt)
  cur.setHours(0, 0, 0, 0)
  const endDay = new Date(until)
  endDay.setHours(23, 59, 59, 999)

  while (cur <= endDay) {
    if (daySet.has(cur.getDay())) {
      const d = new Date(cur)
      d.setHours(time.h, time.m, 0, 0)
      dates.push(d)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return dates
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
  const base = {
    league_id: leagueId,
    organization_id: org.id,
    duration_minutes: d.duration_minutes,
    capacity: d.capacity ?? null,
    location_override: d.location_override || null,
    notes: d.notes || null,
  }

  let scheduledDates: Date[]
  if (d.repeat_days && d.repeat_days.length > 0 && d.repeat_until) {
    const first = new Date(d.scheduled_at)
    const until = new Date(d.repeat_until)
    scheduledDates = buildRecurringDates(first, d.repeat_days, until)
    if (scheduledDates.length === 0) return { error: 'No sessions fall in that date range for the selected days' }
  } else {
    scheduledDates = [new Date(d.scheduled_at)]
  }

  const rows = scheduledDates.map((dt) => ({ ...base, scheduled_at: dt.toISOString() }))

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('event_sessions')
    .update({
      scheduled_at: d.scheduled_at,
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

  // Check league join policy and fetch session together
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (supabase as any)
    .from('leagues')
    .select('pickup_join_policy')
    .eq('id', leagueId)
    .eq('organization_id', org.id)
    .single()

  if (league?.pickup_join_policy === 'private') {
    return { error: 'This event is invite only' }
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
