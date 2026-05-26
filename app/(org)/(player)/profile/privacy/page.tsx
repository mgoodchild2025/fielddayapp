import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { DataExportButton, DeleteAccountSection } from '@/components/profile/privacy-controls'

export default async function PrivacyPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branding } = await (db as any)
    .from('org_branding')
    .select('logo_url, contact_email')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-3xl font-bold uppercase mb-1" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Privacy &amp; Your Data
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Under Canada's <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA),
          you have the right to access, correct, and request deletion of your personal information.
        </p>

        <div className="space-y-5">

          {/* Access */}
          <section className="bg-white rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 mb-0.5">Access my data</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Download a copy of all personal information Fieldday holds about you — your profile,
                  registrations, team memberships, RSVPs, waiver signatures, and payment history.
                </p>
                <DataExportButton />
              </div>
            </div>
          </section>

          {/* Correction */}
          <section className="bg-white rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 mb-0.5">Correct my data</h2>
                <p className="text-sm text-gray-500 mb-4">
                  You can update your name, email, phone number, and other personal details at any time
                  from your profile page.
                </p>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Edit my profile
                </Link>
              </div>
            </div>
          </section>

          {/* Deletion */}
          <section className="bg-white rounded-xl border border-red-100 p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 mb-0.5">Delete my account</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Permanently delete your account and personal information. Payment and registration
                  records are anonymized and retained for 7 years as required by Canadian tax law.
                </p>
                <DeleteAccountSection />
              </div>
            </div>
          </section>

        </div>

        {/* Footer note */}
        <div className="mt-8 pt-6 border-t text-xs text-gray-400 space-y-1">
          <p>
            For questions about how your data is used, or to submit a written correction or deletion
            request, contact{' '}
            {branding?.contact_email
              ? <a href={`mailto:${branding.contact_email}`} className="underline hover:text-gray-600">{branding.contact_email}</a>
              : <a href="mailto:privacy@fielddayapp.ca" className="underline hover:text-gray-600">privacy@fielddayapp.ca</a>
            }.
          </p>
          <p>
            Fieldday complies with the <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA, S.C. 2000, c. 5).
          </p>
        </div>
      </div>

      <Footer org={org} />
    </div>
  )
}
