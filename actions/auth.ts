'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function login(input: { email: string; password: string }) {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { data: null, error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
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
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  })

  if (error) return { data: null, error: error.message }

  // Create profile record
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
    })
  }

  return { data: { userId: data.user?.id }, error: null }
}

export async function logout() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function resetPassword(email: string) {
  const supabase = await createServerClient()
  const origin = headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password/confirm`,
  })
  return { data: null, error: null }
}

const updateProfileSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().optional(),
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
    supabase.from('profiles').update({ full_name: parsed.data.full_name, phone: parsed.data.phone ?? null }).eq('id', user.id),
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
