'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'

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

  const { error } = await db
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
