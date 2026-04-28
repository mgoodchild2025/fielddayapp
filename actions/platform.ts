'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/service'

const IMPERSONATE_COOKIE = 'fieldday_impersonate_org_id'

// ─── Create Organisation ──────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  sport: z.string().default('multi'),
  city: z.string().optional(),
  plan_tier: z.enum(['starter', 'pro', 'club', 'internal']).default('starter'),
})

export async function createOrganization(input: z.infer<typeof createOrgSchema>) {
  const parsed = createOrgSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createServiceRoleClient()

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', parsed.data.slug)
    .single()

  if (existing) return { data: null, error: `Slug "${parsed.data.slug}" is already taken` }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      sport: parsed.data.sport,
      city: parsed.data.city ?? null,
      status: 'trial',
    })
    .select('id')
    .single()

  if (orgError) return { data: null, error: orgError.message }

  // Bootstrap branding + subscription records
  await Promise.all([
    supabase.from('org_branding').insert({ organization_id: org.id }),
    supabase.from('subscriptions').insert({
      organization_id: org.id,
      plan_tier: parsed.data.plan_tier,
      status: 'trialing',
      trial_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ])

  revalidatePath('/super')
  return { data: { id: org.id }, error: null }
}

// ─── Update Organisation ──────────────────────────────────────────────────────

const updateOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  sport: z.string(),
  city: z.string().optional(),
  status: z.enum(['active', 'suspended', 'trial']),
})

export async function updateOrganization(input: z.infer<typeof updateOrgSchema>) {
  const parsed = updateOrgSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createServiceRoleClient()
  const { id, ...updates } = parsed.data

  // Check slug uniqueness (excluding self)
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', updates.slug)
    .neq('id', id)
    .single()

  if (existing) return { error: `Slug "${updates.slug}" is already taken` }

  const { error } = await supabase
    .from('organizations')
    .update({ ...updates, city: updates.city ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/super')
  revalidatePath(`/super/orgs/${id}`)
  return { error: null }
}

// ─── Update Subscription ──────────────────────────────────────────────────────

const updateSubscriptionSchema = z.object({
  orgId: z.string().uuid(),
  plan_tier: z.enum(['starter', 'pro', 'club', 'internal']),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'paused']),
  trial_end: z.string().optional(),
})

export async function updateSubscription(input: z.infer<typeof updateSubscriptionSchema>) {
  const parsed = updateSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        organization_id: parsed.data.orgId,
        plan_tier: parsed.data.plan_tier,
        status: parsed.data.status,
        trial_end: parsed.data.trial_end ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

  if (error) return { error: error.message }
  revalidatePath(`/super/orgs/${parsed.data.orgId}`)
  return { error: null }
}

// ─── Suspend / Activate Organisation ─────────────────────────────────────────

// ─── Set Org Admin ────────────────────────────────────────────────────────────

export async function setOrgAdmin(orgId: string, email: string) {
  const supabase = createServiceRoleClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('email', email.toLowerCase().trim())
    .single()
  if (!profile) return { error: `No user found with email "${email}"` }
  const { error } = await supabase
    .from('org_members')
    .upsert(
      { organization_id: orgId, user_id: profile.id, role: 'org_admin', status: 'active' },
      { onConflict: 'organization_id,user_id' }
    )
  if (error) return { error: error.message }
  revalidatePath(`/super/orgs/${orgId}`)
  return { error: null, name: profile.full_name }
}

// ─── Impersonation ────────────────────────────────────────────────────────────

export async function startImpersonation(orgId: string) {
  const jar = await cookies()
  jar.set(IMPERSONATE_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })
  redirect('/admin/dashboard')
}

export async function exitImpersonation() {
  const jar = await cookies()
  jar.delete(IMPERSONATE_COOKIE)
  redirect('/super')
}

// ─── Suspend / Activate Organisation ─────────────────────────────────────────

export async function setOrgStatus(orgId: string, status: 'active' | 'suspended' | 'trial') {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('organizations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/super')
  revalidatePath(`/super/orgs/${orgId}`)
  return { error: null }
}
