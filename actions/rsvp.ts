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
