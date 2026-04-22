import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { cache } from 'react'

export type OrgContext = {
  id: string
  slug: string
  name: string
}

export const getCurrentOrg = cache(async (headersList: ReadonlyHeaders): Promise<OrgContext> => {
  const orgId = headersList.get('x-org-id')
  if (!orgId) throw new Error('No org context: x-org-id header missing')

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .eq('id', orgId)
    .single()

  if (error || !data) throw new Error(`Org not found for id: ${orgId}`)

  return data
})
