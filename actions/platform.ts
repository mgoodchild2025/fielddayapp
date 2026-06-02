'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { recordAuditLog, AUDIT_ACTIONS, getAuditActor } from '@/lib/audit'

const IMPERSONATE_COOKIE = 'fieldday_impersonate_org_id'

// ─── Create Organisation ──────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  sport: z.string().default('multi'),
  city: z.string().optional(),
  plan_tier: z.enum(['free', 'starter', 'pro', 'club', 'internal']).default('free'),
})

export async function createOrganization(input: z.infer<typeof createOrgSchema> & { adminEmail?: string }) {
  const { adminEmail, ...rest } = input
  const parsed = createOrgSchema.safeParse(rest)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('subscriptions').insert({
      organization_id: org.id,
      plan_tier: parsed.data.plan_tier,
      status: 'trialing',
      trial_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ])

  if (adminEmail) {
    await setOrgAdmin(org.id, adminEmail)
  }

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
  plan_tier: z.enum(['free', 'starter', 'pro', 'club', 'internal']),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'paused']),
  trial_end: z.string().optional(),
})

export async function updateSubscription(input: z.infer<typeof updateSubscriptionSchema>) {
  const parsed = updateSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const supabase = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
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

// ─── Set Org Admin ────────────────────────────────────────────────────────────

export async function setOrgAdmin(orgId: string, email: string) {
  if (!email) return { error: 'Email is required' }

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
      {
        organization_id: orgId,
        user_id: profile.id,
        role: 'org_admin',
        status: 'active',
      },
      { onConflict: 'organization_id,user_id' }
    )

  if (error) return { error: error.message }

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
    targetType: 'member',
    targetId: profile.id,
    targetLabel: profile.full_name ?? email,
    metadata: { to: 'org_admin', via: 'platform_console' },
  })

  revalidatePath(`/super/orgs/${orgId}`)
  return { error: null, name: profile.full_name }
}

// ─── Impersonation ────────────────────────────────────────────────────────────

export async function startImpersonation(orgId: string): Promise<{ redirect: string }> {
  const jar = await cookies()
  jar.set(IMPERSONATE_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: AUDIT_ACTIONS.IMPERSONATION_STARTED,
    targetType: 'organization',
    targetId: orgId,
    metadata: { via: 'platform_console' },
  })

  return { redirect: '/admin/dashboard' }
}

export async function exitImpersonation(): Promise<{ redirect: string }> {
  const jar = await cookies()
  const orgId = jar.get(IMPERSONATE_COOKIE)?.value
  jar.delete(IMPERSONATE_COOKIE)

  if (orgId) {
    const actor = await getAuditActor()
    await recordAuditLog({
      orgId,
      actorUserId: actor.actorUserId,
      actorLabel: actor.actorLabel,
      action: AUDIT_ACTIONS.IMPERSONATION_ENDED,
      targetType: 'organization',
      targetId: orgId,
      metadata: { via: 'platform_console' },
    })
  }

  return { redirect: '/super' }
}

// ─── Delete Organisation ──────────────────────────────────────────────────────

export async function deleteOrganization(orgId: string): Promise<{ error: string | null }> {
  if (!orgId) return { error: 'Invalid org ID' }

  const supabase = createServiceRoleClient()

  // Safety check: only suspended orgs may be deleted
  const { data: org } = await supabase
    .from('organizations')
    .select('status, slug')
    .eq('id', orgId)
    .single()

  if (!org) return { error: 'Organization not found' }
  if (org.status !== 'suspended') return { error: 'Only suspended organizations can be deleted' }

  // Clean up storage objects for this org (non-fatal if bucket doesn't exist yet)
  await supabase.storage.from('org-branding').remove([`${orgId}/logo.png`, `${orgId}/logo.jpg`, `${orgId}/logo.webp`, `${orgId}/logo.svg`, `${orgId}/logo.gif`]).catch(() => {})

  const { error } = await supabase.from('organizations').delete().eq('id', orgId)
  if (error) return { error: error.message }

  revalidatePath('/super')
  return { error: null }
}

// ─── Org Maintenance Mode ─────────────────────────────────────────────────────

export async function setOrgMaintenance(
  orgId: string,
  enabled: boolean,
  message: string | null,
  until: string | null,  // ISO 8601 or null
): Promise<{ error: string | null }> {
  const supabase = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('organizations')
    .update({
      maintenance_mode: enabled,
      maintenance_message: message?.trim() || null,
      maintenance_until: until || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)

  if (error) return { error: (error as { message: string }).message }

  revalidatePath(`/super/orgs/${orgId}`)
  revalidatePath('/', 'layout')
  return { error: null }
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
