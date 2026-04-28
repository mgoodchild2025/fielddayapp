'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sendEmail, buildTeamInviteEmail } from '@/lib/email'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InviteDetails {
  id: string
  status: string
  role: string
  invited_email: string
  expires_at: string
  team_id: string
  team_name: string
  inviter_name: string | null
}

// ─── Get invite details (no auth required — for page preview) ─────────────────

export async function getInviteDetails(token: string): Promise<InviteDetails | null> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, status, role, invited_email, expires_at, team_id, invited_by')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return null

  const [{ data: team }, { data: inviter }] = await Promise.all([
    db.from('teams').select('name').eq('id', invite.team_id).single(),
    db.from('profiles').select('full_name').eq('id', invite.invited_by).single(),
  ])

  return {
    id: invite.id,
    status: invite.status,
    role: invite.role,
    invited_email: invite.invited_email,
    expires_at: invite.expires_at,
    team_id: invite.team_id,
    team_name: team?.name ?? 'Unknown Team',
    inviter_name: inviter?.full_name ?? null,
  }
}

// ─── Send invite ──────────────────────────────────────────────────────────────

const sendInviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['captain', 'coach', 'player', 'sub']).default('player'),
})

export async function sendTeamInvite(input: z.infer<typeof sendInviteSchema>) {
  const parsed = sendInviteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is captain/coach or org admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    db.from('team_members').select('role')
      .eq('team_id', parsed.data.teamId)
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .single(),
    db.from('org_members').select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single(),
  ])

  const isTeamManager = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isTeamManager && !isOrgAdmin) return { error: 'Not authorized' }

  const email = parsed.data.email.toLowerCase()

  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    db.from('teams').select('id, name').eq('id', parsed.data.teamId).eq('organization_id', org.id).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  if (!team) return { error: 'Team not found' }

  // Check if already a member (by email or user_id)
  const { data: inviteeProfile } = await db
    .from('profiles').select('id').eq('email', email).maybeSingle()

  const { data: existingMember } = await db
    .from('team_members')
    .select('id')
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)
    .eq(inviteeProfile?.id ? 'user_id' : 'invited_email', inviteeProfile?.id ?? email)
    .maybeSingle()

  if (existingMember) return { error: `${email} is already on this team` }

  // Create invitation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const { data: invite, error: inviteError } = await anyDb
    .from('team_invitations')
    .insert({
      team_id: parsed.data.teamId,
      organization_id: org.id,
      invited_email: email,
      invited_user_id: inviteeProfile?.id ?? null,
      invited_by: user.id,
      role: parsed.data.role,
    })
    .select('token')
    .single()

  if (inviteError) {
    if (inviteError.code === '23505') return { error: `${email} already has a pending invite to this team` }
    return { error: inviteError.message }
  }

  // Build accept/decline URLs from current request host
  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/invite/${invite.token}`
  const declineUrl = `${origin}/invite/${invite.token}?action=decline`

  const inviterName = inviterProfile?.full_name ?? 'A manager'

  // In-app notification if the invitee has an account
  if (inviteeProfile?.id) {
    await db.from('notifications').insert({
      organization_id: org.id,
      user_id: inviteeProfile.id,
      type: 'team_invite',
      title: `You've been invited to join ${team.name}`,
      body: `${inviterName} invited you as ${parsed.data.role}. Tap to view the invite.`,
      data: { token: invite.token, accept_url: acceptUrl },
    })
  }

  // Send email (no-op if RESEND_API_KEY is not set)
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${team.name}`,
    html: buildTeamInviteEmail({
      teamName: team.name,
      orgName: org.name,
      invitedBy: inviterName,
      role: parsed.data.role,
      acceptUrl,
      declineUrl,
    }),
  })

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { error: null }
}

// ─── Accept invitation ────────────────────────────────────────────────────────

export async function acceptTeamInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', teamId: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, team_id, invited_email, role, status, expires_at')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found', teamId: null }
  if (invite.status === 'accepted') return { error: 'This invitation has already been accepted', teamId: invite.team_id }
  if (invite.status !== 'pending') return { error: 'This invitation is no longer active', teamId: null }
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired', teamId: null }

  // Verify the logged-in user's email matches the invite
  const { data: profile } = await db.from('profiles').select('email').eq('id', user.id).single()
  if (profile?.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
    return { error: `This invite was sent to ${invite.invited_email} — please sign in with that account`, teamId: null }
  }

  // Add to team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberError } = await (db as any).from('team_members').upsert({
    organization_id: org.id,
    team_id: invite.team_id,
    user_id: user.id,
    invited_email: invite.invited_email,
    role: invite.role,
    status: 'active',
  }, { onConflict: 'team_id,user_id' })

  if (memberError) return { error: memberError.message, teamId: null }

  // Ensure org membership
  await db.from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  // Mark invite accepted
  await anyDb.from('team_invitations').update({ status: 'accepted' }).eq('id', invite.id)

  // Mark the in-app notification as read
  await db.from('notifications')
    .update({ read: true })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('type', 'team_invite')

  revalidatePath('/dashboard')
  revalidatePath(`/teams/${invite.team_id}`)
  redirect(`/teams/${invite.team_id}`)
}

// ─── Decline invitation ───────────────────────────────────────────────────────

export async function declineTeamInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const { data: invite } = await anyDb
    .from('team_invitations')
    .select('id, status')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found' }
  if (invite.status !== 'pending') return { error: 'Invitation is no longer active' }

  await anyDb.from('team_invitations').update({ status: 'declined' }).eq('id', invite.id)

  // Mark the in-app notification as read
  await db.from('notifications')
    .update({ read: true })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('type', 'team_invite')

  return { error: null }
}
