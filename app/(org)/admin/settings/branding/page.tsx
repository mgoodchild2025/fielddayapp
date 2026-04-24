import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { BrandingForm } from './branding-form'

export default async function AdminBrandingPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: branding } = await supabase
    .from('org_branding')
    .select('*')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Branding</h1>
      <BrandingForm branding={branding} orgId={org.id} />
    </div>
  )
}
