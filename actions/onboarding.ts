'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'

export async function dismissOnboardingChecklist(): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('org_branding')
    .update({ onboarding_dismissed_at: new Date().toISOString() })
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/dashboard')
  return { error: null }
}
