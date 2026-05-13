import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import type { RailwayDnsRecord } from '@/lib/railway'
import { BrandingForm } from './branding-form'

export default async function AdminBrandingPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const service = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (service as any)
    .from('org_branding')
    .select('*')
    .eq('organization_id', org.id)
    .maybeSingle() as {
      data: {
        organization_id: string
        primary_color: string | null
        secondary_color: string | null
        bg_color: string | null
        text_color: string | null
        heading_font: string | null
        body_font: string | null
        tagline: string | null
        contact_email: string | null
        custom_domain: string | null
        social_instagram: string | null
        social_facebook: string | null
        social_x: string | null
        social_tiktok: string | null
        social_youtube: string | null
        timezone: string | null
        logo_url: string | null
        railway_domain_id: string | null
        railway_cname_host: string | null
        railway_cname_value: string | null
        railway_txt_host: string | null
        railway_txt_value: string | null
      } | null
    }

  // Build initial DNS records from stored columns (status defaults to PENDING;
  // user clicks "Check DNS" to fetch live status from Railway)
  const initialDnsRecords: RailwayDnsRecord[] = []
  if (branding?.railway_cname_host && branding?.railway_cname_value) {
    initialDnsRecords.push({
      hostlabel: branding.railway_cname_host,
      requiredValue: branding.railway_cname_value,
      recordType: 'CNAME',
      status: 'PENDING',
    })
  }
  if (branding?.railway_txt_host && branding?.railway_txt_value) {
    initialDnsRecords.push({
      hostlabel: branding.railway_txt_host,
      requiredValue: branding.railway_txt_value,
      recordType: 'TXT',
      status: 'PENDING',
    })
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Branding</h1>
      <BrandingForm
        branding={branding}
        orgId={org.id}
        initialDnsRecords={initialDnsRecords}
      />
    </div>
  )
}
