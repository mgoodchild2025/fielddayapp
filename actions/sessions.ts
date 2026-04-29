'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

const createSessionSchema = z.object({
  scheduled_at: z.string().min(1, 'Date & time required'),
  duration_minutes: z.coerce.number().int().min(15).default(90),
  capacity: z.coerce.number().int().min(1).optional(),
  location_override: z.string().optional(),
  notes: z.string().optional(),
})

export async function createSession(
  leagueId: string,
  input: z.infer<typeof createSessionSchema>
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const parsed = createSessionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('event_sessions').insert({
    league_id: leagueId,
    organization_id: org.id,
    scheduled_at: parsed.data.scheduled_at,
    duration_minutes: parsed.data.duration_minutes,
    capacity: parsed.data.capacity ?? null,
    location_override: parsed.data.location_override || null,
    notes: parsed.data.notes || null,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/sessions`)
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
  revalidatePath(`/events`, 'layout')
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

  // Fetch session and current registration count atomically enough for our needs
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

  revalidatePath(`/events`, 'layout')
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

  revalidatePath(`/events`)
  return { error: null }
}
