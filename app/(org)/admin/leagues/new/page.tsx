import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { NewLeagueForm } from './new-league-form'

export default async function NewLeaguePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: waivers } = await supabase
    .from('waivers')
    .select('id, title, version')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return <NewLeagueForm waivers={waivers ?? []} />
}
