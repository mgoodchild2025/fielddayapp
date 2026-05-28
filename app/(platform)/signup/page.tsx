import { createServiceRoleClient } from '@/lib/supabase/service'
import { SignupPage } from './signup-form'
import { getTenantConsentDocs } from '@/actions/tenant-consent'
import type { ConsentDoc } from '@/actions/tenant-consent'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Start your free trial — Fieldday',
  description: 'Set up your sports league in minutes. Scheduling, registration, payments, and more.',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { plan } = await searchParams
  const validPlans = ['free', 'starter', 'pro', 'club']
  const defaultPlan = (validPlans.includes(plan ?? '') ? plan : 'pro') as 'free' | 'starter' | 'pro' | 'club'

  const service = createServiceRoleClient()
  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'signups_enabled')
    .single()

  const signupsEnabled = setting?.value !== 'false'

  // Pre-fetch published consent docs so they can be shown in the acceptance step.
  // If not yet published (pre-launch), consentDocs will be null — the form shows a
  // simplified acceptance notice in that case.
  const consentDocs: ConsentDoc[] | null = await getTenantConsentDocs()

  return <SignupPage signupsEnabled={signupsEnabled} defaultPlan={defaultPlan} consentDocs={consentDocs} />
}
