import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getPlayerPendingReconsent } from '@/actions/player-consents'
import { ReconsentForm } from './reconsent-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Updated Agreements' }

export default async function ReconsentPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo = '/dashboard' } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pending = await getPlayerPendingReconsent(org.id, user.id)
  // Nothing pending → straight through
  if (!pending) redirect(redirectTo || '/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-lg bg-white rounded-2xl border shadow-sm p-8">
        <h1 className="text-2xl font-bold mb-2">We&apos;ve updated our agreements</h1>
        <p className="text-sm text-gray-600 mb-5">
          Before you continue, please review and accept the updated agreement below.
        </p>

        <div className="rounded-lg border bg-gray-50 p-4 mb-5">
          <div className="flex items-center justify-between">
            <p className="font-medium text-gray-900">{pending.title}</p>
            <span className="text-xs text-gray-400">v{pending.version}</span>
          </div>
          {pending.summary && (
            <p className="text-sm text-gray-600 mt-1.5">{pending.summary}</p>
          )}
          <a
            href={`/legal/${pending.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sm text-blue-600 hover:underline"
          >
            Read the full {pending.title} →
          </a>
        </div>

        <ReconsentForm versionId={pending.versionId} versionLabel={pending.version} redirectTo={redirectTo} />
      </div>
    </div>
  )
}
