import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPendingReacceptance } from '@/actions/tenant-consent'
import { ReacceptForm } from '@/components/legal/reaccept-form'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ redirect?: string }>
}

export default async function ReacceptPage({ searchParams }: Props) {
  const { redirect: redirectTo } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify the user is an org_admin
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'org_admin') {
    // Non-admin — show a notice, not a block
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Agreements have been updated</h1>
          <p className="text-sm text-gray-600">
            Fieldday has updated its legal agreements for <strong>{org.name}</strong>.
            An organization administrator needs to accept the updated terms.
            Please ask your org admin to log in and complete this step.
          </p>
        </div>
      </div>
    )
  }

  const pending = await getPendingReacceptance(org.id)

  // Nothing pending — redirect to destination
  if (pending.length === 0) {
    redirect(redirectTo ?? '/admin/dashboard')
  }

  return (
    <ReacceptForm
      orgId={org.id}
      orgName={org.name}
      docs={pending}
      redirectTo={redirectTo ?? '/admin/dashboard'}
    />
  )
}
