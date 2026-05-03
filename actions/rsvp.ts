'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

/**
 * Upsert the current user's RSVP for a game.
 * teamId must be the team the user belongs to in this game.
 */
export async function upsertRsvp(gameId: string, teamId: string, status: 'in' | 'out') {
  if (!gameId || !teamId || (status !== 'in' && status !== 'out')) {
    return { error: 'Invalid input' }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('game_rsvps')
    .upsert(
      {
        organization_id: org.id,
        game_id: gameId,
        user_id: user.id,
        team_id: teamId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id,user_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export type AttendancePlayer = {
  userId: string
  name: string
  role: string
  rsvp: 'in' | 'out' | null
}

/**
 * Fetch the full roster + RSVP status for a game.
 * Caller must be a captain of the given team.
 */
export async function getGameAttendanceDetails(gameId: string, teamId: string): Promise<{
  players: AttendancePlayer[]
  error: string | null
}> {
  if (!gameId || !teamId) return { players: [], error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { players: [], error: 'Not authenticated' }

  // Verify caller is an active captain of this team
  const { data: captainship } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('role', 'captain')
    .eq('status', 'active')
    .single()
  if (!captainship) return { players: [], error: 'Not authorized' }

  // Fetch all active roster members + all RSVPs for this game in parallel
  const [{ data: members }, { data: rsvps }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('team_members')
      .select('user_id, role, profile:profiles!team_members_user_id_fkey(full_name)')
      .eq('team_id', teamId)
      .eq('organization_id', org.id)
      .eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('game_rsvps')
      .select('user_id, status')
      .eq('game_id', gameId)
      .eq('team_id', teamId),
  ])

  const rsvpMap = new Map<string, 'in' | 'out'>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rsvps ?? []) as any[]) rsvpMap.set(r.user_id, r.status as 'in' | 'out')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: AttendancePlayer[] = ((members ?? []) as any[]).map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    return {
      userId: m.user_id as string,
      name: (profile?.full_name ?? 'Unknown') as string,
      role: m.role as string,
      rsvp: rsvpMap.get(m.user_id) ?? null,
    }
  })

  // Sort: in first, then out, then no-response; alphabetical within each group
  players.sort((a, b) => {
    const order = { in: 0, out: 1 }
    const aO = a.rsvp !== null ? (order[a.rsvp as keyof typeof order] ?? 2) : 2
    const bO = b.rsvp !== null ? (order[b.rsvp as keyof typeof order] ?? 2) : 2
    if (aO !== bO) return aO - bO
    return a.name.localeCompare(b.name)
  })

  return { players, error: null }
}
