import { headers } from 'next/headers'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getMarketingConsent, getPlayerConsentSummary } from '@/actions/player-consents'
import { redirectToLogin } from '@/lib/auth'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { BackLink } from '@/components/ui/back-link'
import { getOrgBrandingCached } from '@/lib/org-cache'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Communication Preferences' }

export default async function CommunicationsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const timeZone = await getOrgTimezone(org.id)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const [marketing, consents, branding] = await Promise.all([
    getMarketingConsent(org.id, user.id),
    getPlayerConsentSummary(org.id, user.id),
    getOrgBrandingCached(org.id),
  ])

  // Latest accepted version per document type
  const latest = (type: string) => consents.find((c) => c.consent_type === type)
  const privacy = latest('privacy_policy')
  const waiver = latest('waiver')

  const { MarketingPrefs } = await import('./marketing-prefs')

  // The same shell as the other profile pages (it was a bare white page with
  // a tiny breadcrumb as the only way back).
  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
    <OrgNav org={org} logoUrl={(branding as { logo_url?: string | null } | null)?.logo_url ?? null} />
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <BackLink fallbackHref="/profile" fallbackLabel="Profile" />
      <h1 className="text-2xl font-bold mt-2 mb-6">Communication Preferences</h1>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-3">Marketing communications</h2>
        <MarketingPrefs initialEmail={marketing.email} initialSms={marketing.sms} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-3">Legal agreements</h2>
        <div className="bg-white rounded-lg border divide-y text-sm">
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="font-medium text-gray-800">Privacy Policy</p>
              {privacy ? (
                <p className="text-xs text-gray-500">
                  {privacy.document_version ? `v${privacy.document_version} · ` : ''}accepted {new Date(privacy.consented_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone })}
                </p>
              ) : <p className="text-xs text-gray-500">Not on record</p>}
            </div>
            <a href="https://fielddayapp.ca/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-10 -my-2 text-xs text-blue-600 hover:underline">View →</a>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="font-medium text-gray-800">League Waiver</p>
              {waiver ? (
                <p className="text-xs text-gray-500">
                  {waiver.document_version ? `v${waiver.document_version} · ` : ''}accepted {new Date(waiver.consented_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone })}
                </p>
              ) : <p className="text-xs text-gray-500">Not on record</p>}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          To withdraw consent to the Privacy Policy or waiver, please delete your account from Profile.
        </p>
      </section>
    </div>
    <Footer org={org} />
    </div>
  )
}
