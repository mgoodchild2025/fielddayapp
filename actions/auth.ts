'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function login(input: { email: string; password: string; redirectTo?: string }) {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { data: null, error: error.message }

  revalidatePath('/', 'layout')
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  // Only allow relative paths to prevent open redirect
  const safeRedirect = input.redirectTo?.startsWith('/') ? input.redirectTo : '/dashboard'
  redirect(orgId ? safeRedirect : '/super')
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
})

export async function signUp(input: { email: string; password: string; fullName: string }) {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const supabase = await createServerClient()
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) return { data: null, error: error.message }

  if (!data.user) return { data: null, error: 'Sign-up failed' }

  const userId = data.user.id
  const email = parsed.data.email

  // Create profile record
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: parsed.data.fullName,
    email,
  })

  // Link any pending team invites for this email
  const service = createServiceRoleClient()
  const { data: pendingInvites } = await service
    .from('team_members')
    .select('id, organization_id, team_id')
    .eq('invited_email', email)
    .is('user_id', null)
    .eq('status', 'invited')

  if (pendingInvites && pendingInvites.length > 0) {
    // Update all pending invites to link this user
    await service
      .from('team_members')
      .update({ user_id: userId, status: 'active' })
      .eq('invited_email', email)
      .is('user_id', null)
      .eq('status', 'invited')

    // Ensure org membership for each org they were invited into
    const orgIds = [...new Set(pendingInvites.map((i) => i.organization_id))]
    for (const orgId of orgIds) {
      await service.from('org_members').upsert({
        organization_id: orgId,
        user_id: userId,
        role: 'player',
        status: 'active',
      }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })
    }
  }

  return { data: { userId }, error: null }
}

export async function logout() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function resetPassword(email: string) {
  const supabase = await createServerClient()
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  await supabase.auth.resetPasswordForEmail(email, {
    // Route through the existing PKCE callback handler, then land on the confirm page
    redirectTo: `${origin}/auth/callback?next=/reset-password/confirm`,
  })
  return { data: null, error: null }
}

export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

const updateProfileSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().optional(),
  sms_opted_in: z.boolean().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']).optional(),
  t_shirt_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  orgId: z.string().uuid(),
})

export async function updateProfile(input: z.infer<typeof updateProfileSchema>) {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const [profileRes, detailsRes] = await Promise.all([
    supabase.from('profiles').update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      sms_opted_in: parsed.data.sms_opted_in ?? false,
    }).eq('id', user.id),
    supabase.from('player_details').upsert({
      organization_id: parsed.data.orgId,
      user_id: user.id,
      skill_level: parsed.data.skill_level ?? null,
      t_shirt_size: parsed.data.t_shirt_size ?? null,
      emergency_contact_name: parsed.data.emergency_contact_name ?? null,
      emergency_contact_phone: parsed.data.emergency_contact_phone ?? null,
    }, { onConflict: 'organization_id,user_id' }),
  ])

  if (profileRes.error) return { data: null, error: profileRes.error.message }
  if (detailsRes.error) return { data: null, error: detailsRes.error.message }

  revalidatePath('/profile')
  return { data: null, error: null }
}
