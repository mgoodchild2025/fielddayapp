import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { BrandingForm } from './branding-form'
import { CheckinSoundPicker } from '@/components/settings/checkin-sound-picker'

export default async function AdminBrandingPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: branding } = await supabase
    .from('org_branding')
    .select('*')
    .eq('organization_id', org.id)
    .single()

  // checkin_sound may not be in the generated DB types yet — cast safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkinSound = (branding as any)?.checkin_sound ?? null

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Branding</h1>
        <BrandingForm branding={branding} orgId={org.id} />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4">Check-In Settings</h2>
        <CheckinSoundPicker currentSound={checkinSound} orgId={org.id} />
      </div>
    </div>
  )
}
