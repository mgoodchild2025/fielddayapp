'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendEmail, buildOrganizerInviteEmail } from '@/lib/email'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrganizerRow = {
  id: string
  invited_email: string
  status: 'pending' | 'active' | 'declined' | 'removed'
  user_id: string | null
  full_name: string | null
  created_at: string
  expires_at: string
}

export type OrgAdminRow = {
  user_id: string
  full_name: string | null
  email: string | null
}

export type LeagueOrganizersResult = {
  orgAdmins: OrgAdminRow[]
  coOrganizers: OrganizerRow[]
}

// ─── Get invite details (no auth required) ────────────────────────────────────

export async function getOrganizerInviteDetails(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: invite } = await anyDb
    .from('league_organizers')
    .select('id, status, invited_email, expires_at, league_id, invited_by')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return null

  const [{ data: league }, { data: inviter }] = await Promise.all([
    db.from('leagues').select('id, name').eq('id', invite.league_id).single(),
    db.from('profiles').select('full_name').eq('id', invite.invited_by).single(),
  ])

  return {
    id: invite.id,
    status: invite.status as 'pending' | 'active' | 'declined' | 'removed',
    invited_email: invite.invited_email,
    expires_at: invite.expires_at,
    league_id: invite.league_id,
    league_name: league?.name ?? 'Unknown Event',
    inviter_name: inviter?.full_name ?? null,
    org_name: org.name,
  }
}

// ─── Get organizers for a league ─────────────────────────────────────────────

export async function getLeagueOrganizers(leagueId: string): Promise<LeagueOrganizersResult> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  // Check caller is admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orgAdmins: [], coOrganizers: [] }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { orgAdmins: [], coOrganizers: [] }
  }

  // Fetch org admins
  const { data: adminMembers } = await db
    .from('org_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('role', 'org_admin')
    .eq('status', 'active')

  const adminIds = (adminMembers ?? []).map((m: { user_id: string }) => m.user_id)
  let orgAdmins: OrgAdminRow[] = []
  if (adminIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', adminIds)
    orgAdmins = (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => ({
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
    }))
  }

  // Fetch co-organizer rows (exclude removed)
  const { data: organizerRows } = await anyDb
    .from('league_organizers')
    .select('id, invited_email, status, user_id, expires_at, created_at')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .neq('status', 'removed')
    .order('created_at', { ascending: true })

  // Enrich with names for accepted ones
  const userIds = (organizerRows ?? [])
    .filter((r: { user_id: string | null }) => r.user_id)
    .map((r: { user_id: string }) => r.user_id)

  let profileMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? ''])
    )
  }

  const coOrganizers: OrganizerRow[] = (organizerRows ?? []).map((r: {
    id: string
    invited_email: string
    status: string
    user_id: string | null
    expires_at: string
    created_at: string
  }) => ({
    id: r.id,
    invited_email: r.invited_email,
    status: r.status as OrganizerRow['status'],
    user_id: r.user_id,
    full_name: r.user_id ? (profileMap[r.user_id] ?? null) : null,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }))

  return { orgAdmins, coOrganizers }
}

// ─── Invite co-organizer ──────────────────────────────────────────────────────

const inviteSchema = z.object({
  leagueId: z.string().uuid(),
  email: z.string().email(),
})

export async function inviteCoOrganizer(input: { leagueId: string; email: string }) {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Only org_admin can invite
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member || member.role !== 'org_admin') return { error: 'Only org admins can invite co-organizers' }

  const email = parsed.data.email.toLowerCase()

  // Fetch league info
  const { data: league } = await db
    .from('leagues')
    .select('id, name')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .single()

  if (!league) return { error: 'Event not found' }

  // Check if invitee is already an org_admin (no need to invite)
  const { data: existingProfile } = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    const { data: existingOrgAdmin } = await db
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', existingProfile.id)
      .eq('role', 'org_admin')
      .maybeSingle()

    if (existingOrgAdmin) return { error: `${email} is already an org admin and can manage all events` }
  }

  const { data: inviterProfile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Upsert invite row (reset token + expiry if re-inviting)
  const newToken = crypto.randomUUID()
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: upsertError } = await anyDb
    .from('league_organizers')
    .upsert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      invited_email: email,
      invited_by: user.id,
      user_id: existingProfile?.id ?? null,
      status: 'pending',
      token: newToken,
      expires_at: newExpiry,
    }, {
      onConflict: 'league_id,invited_email',
      ignoreDuplicates: false,
    })
    .select('token')
    .single()

  if (upsertError) return { error: upsertError.message }

  // Build email URLs
  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/organizer-invite/${invite.token}`
  const declineUrl = `${origin}/organizer-invite/${invite.token}?action=decline`

  const inviterName = inviterProfile?.full_name ?? 'An admin'

  // In-app notification if they already have an account
  if (existingProfile?.id) {
    await db.from('notifications').insert({
      organization_id: org.id,
      user_id: existingProfile.id,
      type: 'organizer_invite',
      title: `You've been invited to co-organize ${league.name}`,
      body: `${inviterName} invited you to help organize ${league.name}. Tap to view the invite.`,
      data: { token: invite.token, accept_url: acceptUrl, league_id: parsed.data.leagueId },
    })
  }

  await sendEmail({
    to: email,
    subject: `You've been invited to co-organize ${league.name}`,
    html: buildOrganizerInviteEmail({
      orgName: org.name,
      leagueName: league.name,
      inviterName,
      acceptUrl,
      declineUrl,
    }),
  })

  revalidatePath(`/admin/events/${parsed.data.leagueId}`)
  return { error: null }
}

// ─── Accept invitation ────────────────────────────────────────────────────────

export async function acceptOrganizerInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be logged in to accept an invitation' }

  const { data: userProfile } = await db
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  if (!userProfile) return { error: 'User profile not found' }

  // Fetch invite
  const { data: invite } = await anyDb
    .from('league_organizers')
    .select('id, status, invited_email, expires_at, league_id')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found' }
  if (invite.status === 'active') return { error: null, leagueId: invite.league_id } // already accepted
  if (invite.status === 'declined') return { error: 'This invitation has already been declined' }
  if (invite.status === 'removed') return { error: 'This invitation is no longer valid' }
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired' }

  // Verify email matches
  if (userProfile.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
    return { error: `This invitation was sent to ${invite.invited_email}. Please sign in with that email address.` }
  }

  // Accept: update league_organizers row
  await anyDb
    .from('league_organizers')
    .update({ status: 'active', user_id: user.id })
    .eq('id', invite.id)

  // Upsert org_members as league_admin (don't downgrade an existing org_admin)
  const { data: existingMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingMember) {
    await db.from('org_members').insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'league_admin',
      status: 'active',
    })
  } else if (existingMember.role === 'player' || existingMember.role === 'captain') {
    // Upgrade to league_admin
    await db
      .from('org_members')
      .update({ role: 'league_admin', status: 'active' })
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
  }
  // If already org_admin or league_admin, leave as-is

  revalidatePath(`/admin/events/${invite.league_id}`)
  return { error: null, leagueId: invite.league_id }
}

// ─── Decline invitation ───────────────────────────────────────────────────────

export async function declineOrganizerInvitation(token: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: invite } = await anyDb
    .from('league_organizers')
    .select('id, status, league_id')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!invite) return { error: 'Invitation not found' }
  if (invite.status !== 'pending') return { error: null } // already handled

  await anyDb
    .from('league_organizers')
    .update({ status: 'declined' })
    .eq('id', invite.id)

  return { error: null }
}

// ─── Remove co-organizer ──────────────────────────────────────────────────────

export async function removeCoOrganizer(organizerId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member || member.role !== 'org_admin') return { error: 'Only org admins can remove co-organizers' }

  // Fetch the organizer row
  const { data: organizer } = await anyDb
    .from('league_organizers')
    .select('id, user_id, league_id')
    .eq('id', organizerId)
    .eq('organization_id', org.id)
    .single()

  if (!organizer) return { error: 'Co-organizer not found' }

  // Mark as removed
  await anyDb
    .from('league_organizers')
    .update({ status: 'removed' })
    .eq('id', organizerId)

  // If this user has no other active assignments, downgrade their org_members role to 'player'
  if (organizer.user_id) {
    const { data: otherAssignments } = await anyDb
      .from('league_organizers')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', organizer.user_id)
      .eq('status', 'active')
      .neq('id', organizerId)

    if (!otherAssignments || otherAssignments.length === 0) {
      // Check current role (don't downgrade an org_admin)
      const { data: targetMember } = await db
        .from('org_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', organizer.user_id)
        .single()

      if (targetMember?.role === 'league_admin') {
        await db
          .from('org_members')
          .update({ role: 'player' })
          .eq('organization_id', org.id)
          .eq('user_id', organizer.user_id)
      }
    }
  }

  revalidatePath(`/admin/events/${organizer.league_id}`)
  return { error: null }
}

// ─── Resend invite ────────────────────────────────────────────────────────────

export async function resendOrganizerInvite(organizerId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member || member.role !== 'org_admin') return { error: 'Only org admins can resend invitations' }

  const { data: organizer } = await anyDb
    .from('league_organizers')
    .select('id, invited_email, league_id, status')
    .eq('id', organizerId)
    .eq('organization_id', org.id)
    .single()

  if (!organizer) return { error: 'Invitation not found' }
  if (organizer.status === 'active') return { error: 'This person has already accepted' }

  const { data: league } = await db
    .from('leagues')
    .select('name')
    .eq('id', organizer.league_id)
    .single()

  const { data: inviterProfile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Reset token and expiry
  const newToken = crypto.randomUUID()
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await anyDb
    .from('league_organizers')
    .update({ token: newToken, expires_at: newExpiry, status: 'pending' })
    .eq('id', organizerId)

  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/organizer-invite/${newToken}`
  const declineUrl = `${origin}/organizer-invite/${newToken}?action=decline`

  await sendEmail({
    to: organizer.invited_email,
    subject: `Reminder: You've been invited to co-organize ${league?.name ?? 'an event'}`,
    html: buildOrganizerInviteEmail({
      orgName: org.name,
      leagueName: league?.name ?? 'an event',
      inviterName: inviterProfile?.full_name ?? 'An admin',
      acceptUrl,
      declineUrl,
    }),
  })

  revalidatePath(`/admin/events/${organizer.league_id}`)
  return { error: null }
}
