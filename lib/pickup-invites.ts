import { createServiceRoleClient } from '@/lib/supabase/service'

// Invite lookups/acceptance by (event, email), used by the registration and
// invite actions after they've identified the caller. Not in a 'use server'
// file: as exports there they were public endpoints — anyone could test
// whether an email was invited, or mark someone else's invite accepted
// (which also burns single-use drop-in invites).

export async function checkPickupInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('pickup_invites')
    .select('id')
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'season')
    .in('status', ['pending', 'accepted'])
    .maybeSingle()

  return !!data
}

export async function checkDropInInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('pickup_invites')
    .select('id')
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'drop_in')
    .eq('status', 'pending')
    .maybeSingle()

  return !!data
}

export async function acceptPickupInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()

  await db
    .from('pickup_invites')
    .update({ status: 'accepted' })
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'season')
    .eq('status', 'pending')
}

export async function acceptDropInInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()

  await db
    .from('pickup_invites')
    .update({ status: 'accepted' })
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'drop_in')
    .eq('status', 'pending')
}
