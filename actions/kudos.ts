'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createNotifications } from '@/lib/notify'
import { displayName } from '@/lib/team-cards'
import { isKudosKind, kudosAlert, kudosOpen } from '@/lib/kudos'

const schema = z.object({
  gameId: z.string().uuid(),
  toUserId: z.string().uuid(),
  kind: z.string(),
})

/**
 * Give (or change) kudos to a player in a game you played in. Both the giver
 * and the receiver must be active members of one of the game's two teams;
 * open from the game's start for 3 days; never yourself. The receiver is
 * alerted the first time only (changing the kind is silent).
 */
export async function giveKudos(input: z.infer<typeof schema>): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success || !isKudosKind(parsed.data.kind)) return { error: 'Invalid kudos' }
  const { gameId, toUserId, kind } = parsed.data

  const org = await getCurrentOrg(await headers())
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  if (user.id === toUserId) return { error: "You can't give yourself kudos." }

  const db = createServiceRoleClient()
  const { data: game } = await db.from('games')
    .select('id, league_id, scheduled_at, status, home_team_id, away_team_id')
    .eq('id', gameId).eq('organization_id', org.id).maybeSingle()
  if (!game?.home_team_id || !game.away_team_id) return { error: 'Game not found' }
  if (!kudosOpen(game.scheduled_at, game.status, Date.now())) return { error: 'Kudos for this game are closed.' }

  const { data: members } = await db.from('team_members')
    .select('user_id, team_id')
    .in('team_id', [game.home_team_id, game.away_team_id])
    .in('user_id', [user.id, toUserId])
    .eq('status', 'active')
  const giverTeam = (members ?? []).find((m) => m.user_id === user.id)?.team_id
  const receiverTeam = (members ?? []).find((m) => m.user_id === toUserId)?.team_id
  if (!giverTeam) return { error: 'Only players in this game can give kudos.' }
  if (!receiverTeam) return { error: "That player isn't in this game." }

  const { data: existing } = await db.from('kudos').select('id')
    .eq('game_id', gameId).eq('from_user_id', user.id).eq('to_user_id', toUserId).maybeSingle()

  const { error } = await db.from('kudos').upsert({
    organization_id: org.id,
    league_id: game.league_id,
    game_id: gameId,
    from_user_id: user.id,
    to_user_id: toUserId,
    kind,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'game_id,from_user_id,to_user_id' })
  if (error) return { error: "Couldn't send kudos. Try again." }

  if (!existing) {
    const { data: giver } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const { title, body } = kudosAlert(displayName(giver?.full_name ?? 'A player', 'short'), kind, giverTeam !== receiverTeam)
    await createNotifications([{
      organization_id: org.id,
      user_id: toUserId,
      type: 'kudos',
      title,
      body,
      data: { game_id: gameId, href: `/games/${gameId}#kudos`, link_label: 'See the game' },
    }])
  }

  revalidatePath(`/games/${gameId}`)
  return { error: null }
}
