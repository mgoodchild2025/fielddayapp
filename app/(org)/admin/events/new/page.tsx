import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { NewLeagueForm } from './new-event-form'

export default async function NewLeaguePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const [{ data: waivers }, { data: ruleTemplates }] = await Promise.all([
    supabase
      .from('waivers')
      .select('id, title, version')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('league_rule_templates')
      .select('id, title, content')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
  ])

  return <NewLeagueForm waivers={waivers ?? []} ruleTemplates={ruleTemplates ?? []} />
}
