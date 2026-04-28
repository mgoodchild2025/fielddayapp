'use server'

import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

const signupSchema = z.object({
  orgName: z.string().min(2, 'Organization name must be at least 2 characters').max(60),
  slug: z
    .string()
    .min(2, 'Subdomain must be at least 2 characters')
    .max(30, 'Subdomain must be 30 characters or fewer')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  plan: z.enum(['starter', 'pro', 'club']).default('pro'),
})

export async function orgSignup(input: z.infer<typeof signupSchema>) {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', slug: null }

  const { orgName, slug, fullName, email, password, plan } = parsed.data
  const service = createServiceRoleClient()

  // Check signups are enabled
  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'signups_enabled')
    .single()

  if (setting?.value === 'false') {
    return { error: 'New sign-ups are temporarily paused. Please check back soon.', slug: null }
  }

  // Check slug uniqueness
  const { data: existing } = await service
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) return { error: `"${slug}" is already taken — try a different subdomain`, slug: null }

  // Determine email redirect target
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const isDev = process.env.NODE_ENV === 'development'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const orgCallbackUrl = isDev
    ? `${appUrl}/auth/callback?next=/admin/dashboard`
    : `https://${slug}.${platformDomain}/auth/callback?next=/admin/dashboard`

  // Create Supabase auth user (sends verification email automatically)
  const supabase = await createServerClient()
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: orgCallbackUrl,
    },
  })

  if (authError) return { error: authError.message, slug: null }
  if (!authData.user) return { error: 'Failed to create account', slug: null }

  const userId = authData.user.id

  // Create profile row
  await service.from('profiles').upsert({ id: userId, full_name: fullName, email })

  // Create organization
  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({ name: orgName, slug, sport: 'multi', status: 'trial' })
    .select('id')
    .single()

  if (orgError) return { error: orgError.message, slug: null }

  const trialEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()

  await Promise.all([
    service.from('org_branding').insert({ organization_id: org.id }),
    service.from('subscriptions').insert({
      organization_id: org.id,
      plan_tier: plan,
      status: 'trialing',
      trial_end: trialEnd,
    }),
    service.from('org_members').insert({
      organization_id: org.id,
      user_id: userId,
      role: 'org_admin',
      status: 'active',
    }),
  ])

  return { error: null, slug }
}

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean }> {
  if (!slug || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
    return { available: false }
  }
  const service = createServiceRoleClient()
  const { data } = await service.from('organizations').select('id').eq('slug', slug).single()
  return { available: !data }
}
