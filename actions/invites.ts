'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { sendEmail, buildPickupInviteEmail } from '@/lib/email'

async function requireOrgAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', org, db: createServiceRoleClient() }
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()
  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Forbidden', org, db }
  }
  return { error: null, org, db }
}

export async function invitePlayerToPickup(
  leagueId: string,
  email: string,
  inviteType: 'season' | 'drop_in' = 'season',
) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  const normalizedEmail = email.trim().toLowerCase()

  const [{ data: league }, { data: branding }] = await Promise.all([
    db.from('leagues').select('name, slug').eq('id', leagueId).eq('organization_id', org.id).single(),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
  ])

  if (!league) return { error: 'League not found' }

  // For drop-in invites, block if there's already a pending drop-in invite for this email
  if (inviteType === 'drop_in') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from('pickup_invites')
      .select('id')
      .eq('league_id', leagueId)
      .eq('email', normalizedEmail)
      .eq('invite_type', 'drop_in')
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) return { error: 'This player already has a pending drop-in invite' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite, error: insertError } = await (db as any)
    .from('pickup_invites')
    .insert({
      organization_id: org.id,
      league_id: leagueId,
      email: normalizedEmail,
      invite_type: inviteType,
    })
    .select('token')
    .single()

  if (insertError) {
    if (insertError.code === '23505') return { error: 'This email has already been invited for the season' }
    return { error: insertError.message }
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const inviteUrl = inviteType === 'drop_in'
    ? `${origin}/events/${league.slug}?invite=${invite.token}&mode=drop_in`
    : `${origin}/events/${league.slug}?invite=${invite.token}`

  await sendEmail({
    to: normalizedEmail,
    subject: inviteType === 'drop_in'
      ? `You're invited as a drop-in to ${league.name}`
      : `You're invited to ${league.name}`,
    html: buildPickupInviteEmail({
      orgName: org.name,
      leagueName: league.name,
      inviteUrl,
      isDropIn: inviteType === 'drop_in',
    }),
  })

  revalidatePath(`/admin/events/${leagueId}/invites`)
  return { error: null }
}

export async function revokePickupInvite(inviteId: string, leagueId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteError } = await (db as any)
    .from('pickup_invites')
    .delete()
    .eq('id', inviteId)
    .eq('organization_id', org.id)

  if (deleteError) return { error: deleteError.message }

  revalidatePath(`/admin/events/${leagueId}/invites`)
  return { error: null }
}

export async function getPickupInvites(leagueId: string) {
  const { error, org, db } = await requireOrgAdmin()
  if (error) return { data: null, error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: fetchError } = await (db as any)
    .from('pickup_invites')
    .select('id, email, status, invite_type, invited_at')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .order('invited_at', { ascending: false })

  if (fetchError) return { data: null, error: fetchError.message }
  return { data, error: null }
}

export async function checkPickupInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('pickup_invites')
    .update({ status: 'accepted' })
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'season')
    .eq('status', 'pending')
}

export async function acceptDropInInvite(leagueId: string, userEmail: string) {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('pickup_invites')
    .update({ status: 'accepted' })
    .eq('league_id', leagueId)
    .eq('email', userEmail.toLowerCase())
    .eq('invite_type', 'drop_in')
    .eq('status', 'pending')
}
