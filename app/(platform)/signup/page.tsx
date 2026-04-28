import { createServiceRoleClient } from '@/lib/supabase/service'
import { SignupPage } from './signup-form'

export const metadata = {
  title: 'Start your free trial — Fieldday',
  description: 'Set up your sports league in minutes. Scheduling, registration, payments, and more.',
}

export default async function Page() {
  const service = createServiceRoleClient()
  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'signups_enabled')
    .single()

  const signupsEnabled = setting?.value !== 'false'

  return <SignupPage signupsEnabled={signupsEnabled} />
}
