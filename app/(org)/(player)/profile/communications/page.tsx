import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getMarketingConsent, getPlayerConsentSummary } from '@/actions/player-consents'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Communication Preferences' }

export default async function CommunicationsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [marketing, consents] = await Promise.all([
    getMarketingConsent(org.id, user.id),
    getPlayerConsentSummary(org.id, user.id),
  ])

  // Latest accepted version per document type
  const latest = (type: string) => consents.find((c) => c.consent_type === type)
  const privacy = latest('privacy_policy')
  const waiver = latest('waiver')

  const { MarketingPrefs } = await import('./marketing-prefs')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-1 text-sm text-gray-400">
        <Link href="/profile" className="hover:text-gray-600 transition-colors">Profile</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-700 font-medium">Communication Preferences</span>
      </div>
      <h1 className="text-2xl font-bold mb-6">Communication Preferences</h1>

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
                <p className="text-xs text-gray-400">
                  {privacy.document_version ? `v${privacy.document_version} · ` : ''}accepted {new Date(privacy.consented_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              ) : <p className="text-xs text-gray-400">Not on record</p>}
            </div>
            <a href="https://fielddayapp.ca/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View →</a>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="font-medium text-gray-800">League Waiver</p>
              {waiver ? (
                <p className="text-xs text-gray-400">
                  {waiver.document_version ? `v${waiver.document_version} · ` : ''}accepted {new Date(waiver.consented_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              ) : <p className="text-xs text-gray-400">Not on record</p>}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          To withdraw consent to the Privacy Policy or waiver, please delete your account from Profile.
        </p>
      </section>
    </div>
  )
}
