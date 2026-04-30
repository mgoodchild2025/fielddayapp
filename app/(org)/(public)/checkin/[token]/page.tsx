import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { selfCheckIn } from '@/actions/checkin'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

export default async function SelfCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { data: branding } = await db
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  const result = await selfCheckIn(token)

  const isSuccess = result.status === 'success'
  const isAlreadyIn = result.status === 'already_checked_in'
  const isNotFound = result.status === 'not_found'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        {isSuccess && (
          <div className="bg-white rounded-2xl border p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h1 className="text-xl font-bold text-green-800 mb-1">Checked In!</h1>
            <p className="text-lg font-semibold mb-1">{result.playerName}</p>
            <p className="text-sm text-gray-500">You&apos;re all set. Have a great game!</p>
          </div>
        )}

        {isAlreadyIn && (
          <div className="bg-white rounded-2xl border p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠</span>
            </div>
            <h1 className="text-xl font-bold text-amber-800 mb-1">Already Checked In</h1>
            <p className="text-lg font-semibold mb-1">{result.playerName}</p>
            <p className="text-sm text-gray-500">
              Checked in at{' '}
              {new Date(result.checkedInAt).toLocaleTimeString('en-CA', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}

        {isNotFound && (
          <div className="bg-white rounded-2xl border p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✗</span>
            </div>
            <h1 className="text-xl font-bold text-red-800 mb-1">QR Code Not Found</h1>
            <p className="text-sm text-gray-500">
              This check-in code is not recognised. Please contact an event representative.
            </p>
          </div>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
