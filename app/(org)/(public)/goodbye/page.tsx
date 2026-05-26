import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

export default async function GoodbyePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (db as any)
    .from('org_branding')
    .select('logo_url, contact_email')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Account deleted</h1>
      <p className="text-gray-500 max-w-sm mb-6">
        Your account and personal information have been permanently removed.
        Payment and registration records have been anonymized and are retained as required by Canadian tax law.
      </p>
      {branding?.contact_email && (
        <p className="text-sm text-gray-400">
          Questions?{' '}
          <a href={`mailto:${branding.contact_email}`} className="underline hover:text-gray-600">
            {branding.contact_email}
          </a>
        </p>
      )}
    </div>
  )
}
