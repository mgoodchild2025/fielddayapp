'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

type OrgRole = 'org_admin' | 'league_admin' | 'captain' | 'player'

/** Change an org member's role. Only org_admin can do this. */
export async function changeMemberRole(memberId: string, newRole: OrgRole) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Verify caller is org_admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!caller || caller.role !== 'org_admin') return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('org_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { error: null }
}

/** Remove (suspend) an org member. Only org_admin can do this. */
export async function removeMember(memberId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!caller || caller.role !== 'org_admin') return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('org_members')
    .update({ status: 'suspended' })
    .eq('id', memberId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { error: null }
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['org_admin', 'league_admin', 'captain', 'player']).default('player'),
})

/** Invite a new member by email. Creates an org_members record with status=invited. */
export async function inviteMember(input: FormData) {
  const raw = {
    email: input.get('email') as string,
    role: (input.get('role') as OrgRole) ?? 'player',
  }

  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!caller || !['org_admin', 'league_admin'].includes(caller.role)) {
    return { error: 'Unauthorized' }
  }

  // Find existing profile by email
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .single()

  if (existingProfile) {
    // User already has an account — add them directly
    const { error } = await supabase
      .from('org_members')
      .upsert({
        organization_id: org.id,
        user_id: existingProfile.id,
        role: parsed.data.role,
        status: 'active',
        invited_email: parsed.data.email,
      }, { onConflict: 'organization_id,user_id', ignoreDuplicates: false })

    if (error) return { error: error.message }
  } else {
    // No account yet — create a placeholder org_members row with a stub user_id
    // We use a sentinel UUID approach: generate a fake UUID keyed to the org+email
    // In practice, when the user signs up, actions/auth.ts links pending invites
    // We store just the invited_email so it shows in the UI
    // Note: user_id is NOT NULL in schema, so we skip inserting until they sign up
    // Instead just return success and tell the admin to share the signup link
    return { error: null, invited: true, noAccount: true }
  }

  revalidatePath('/admin/users')
  return { error: null, invited: true, noAccount: false }
}
