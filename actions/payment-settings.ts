'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { recordAuditLog, AUDIT_ACTIONS, getAuditActor } from '@/lib/audit'

const schema = z.object({
  stripeSecretKey: z
    .string()
    .refine((v) => v === '' || /^sk_(live|test)_/.test(v), 'Must start with sk_live_ or sk_test_'),
  stripeWebhookSecret: z
    .string()
    .refine((v) => v === '' || /^whsec_/.test(v), 'Must start with whsec_'),
})

export async function savePaymentSettings(input: { stripeSecretKey: string; stripeWebhookSecret: string }) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_payment_settings')
    .upsert(
      {
        organization_id: org.id,
        stripe_secret_key: parsed.data.stripeSecretKey || null,
        stripe_webhook_secret: parsed.data.stripeWebhookSecret || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

  if (error) return { error: error.message }

  const actor = await getAuditActor()
  await recordAuditLog({
    orgId: org.id,
    actorUserId: actor.actorUserId,
    actorLabel: actor.actorLabel,
    action: AUDIT_ACTIONS.PAYMENT_SETTINGS_UPDATED,
    targetType: 'organization',
    targetId: org.id,
    // Never log secret values — just whether they are now set.
    metadata: {
      has_secret_key: !!parsed.data.stripeSecretKey,
      has_webhook_secret: !!parsed.data.stripeWebhookSecret,
    },
  })

  revalidatePath('/admin/settings/payments')
  return { error: null }
}

export async function saveShopPaymentSettings(input: {
  shopPaymentMode: 'stripe' | 'manual'
  manualPaymentInstructions: string | null
}) {
  if (!['stripe', 'manual'].includes(input.shopPaymentMode)) {
    return { error: 'Invalid payment mode' }
  }
  if (input.shopPaymentMode === 'manual' && !input.manualPaymentInstructions?.trim()) {
    return { error: 'Payment instructions are required for manual payment mode' }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_payment_settings')
    .upsert(
      {
        organization_id: org.id,
        shop_payment_mode: input.shopPaymentMode,
        manual_payment_instructions: input.shopPaymentMode === 'manual'
          ? input.manualPaymentInstructions?.trim() ?? null
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/payments')
  return { error: null }
}

export async function saveRegistrationPaymentSettings(input: {
  registrationPaymentMode: 'stripe' | 'manual' | 'both'
  registrationManualInstructions: string | null
}) {
  if (!['stripe', 'manual', 'both'].includes(input.registrationPaymentMode)) {
    return { error: 'Invalid payment mode' }
  }
  // 'both' and 'manual' both offer an offline option, so instructions are needed.
  const offersOffline = input.registrationPaymentMode === 'manual' || input.registrationPaymentMode === 'both'
  if (offersOffline && !input.registrationManualInstructions?.trim()) {
    return { error: 'Payment instructions are required when offline payment is offered' }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_payment_settings')
    .upsert(
      {
        organization_id: org.id,
        registration_payment_mode: input.registrationPaymentMode,
        registration_manual_instructions: offersOffline
          ? input.registrationManualInstructions?.trim() ?? null
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/admin/settings/payments')
  return { error: null }
}

export async function clearPaymentSettings() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  await db.from('org_payment_settings').delete().eq('organization_id', org.id)

  revalidatePath('/admin/settings/payments')
  return { error: null }
}
