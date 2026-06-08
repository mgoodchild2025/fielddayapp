import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

export default async function ChooseOrgPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // This page is only meaningful on the platform domain (no org context).
  // If accessed on an org subdomain just go to the player home.
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')
  if (orgId) redirect('/dashboard')

  const db = createServiceRoleClient()

  // Fetch orgs the user belongs to
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: memberships } = await (db as any)
    .from('org_members')
    .select(`
      role, status,
      organization:organizations!org_members_organization_id_fkey(
        id, name, slug,
        branding:org_branding!org_branding_organization_id_fkey(logo_url)
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  type OrgEntry = {
    id: string; name: string; slug: string; logoUrl: string | null; role: string
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgs: OrgEntry[] = (memberships ?? []).map((m: any) => {
    const org = Array.isArray(m.organization) ? m.organization[0] : m.organization
    const branding = Array.isArray(org?.branding) ? org?.branding[0] : org?.branding
    return {
      id: org?.id ?? '',
      name: org?.name ?? '',
      slug: org?.slug ?? '',
      logoUrl: branding?.logo_url ?? null,
      role: m.role ?? 'player',
    }
  }).filter((o: OrgEntry) => o.id && o.slug)

  // Auto-redirect when there's exactly one org
  if (orgs.length === 1) {
    const org = orgs[0]
    const isAdmin = ['org_admin', 'league_admin'].includes(org.role)
    const dest = `https://${org.slug}.${PLATFORM_DOMAIN}${isAdmin ? '/admin/dashboard' : '/dashboard'}`
    redirect(dest)
  }

  const isAdmin = (role: string) => ['org_admin', 'league_admin'].includes(role)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Fieldday logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/Fieldday-Icon.png" alt="Fieldday" width={48} height={48} className="rounded-xl" />
        <h1 className="text-2xl font-bold text-gray-900">Choose your organization</h1>
        {orgs.length === 0 && (
          <p className="text-sm text-gray-500">You&apos;re not a member of any organization yet.</p>
        )}
        {orgs.length > 1 && (
          <p className="text-sm text-gray-500">Select which organization you&apos;d like to access.</p>
        )}
      </div>

      {orgs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
          {orgs.map((org) => {
            const dest = `https://${org.slug}.${PLATFORM_DOMAIN}${isAdmin(org.role) ? '/admin/dashboard' : '/my-events'}`
            return (
              <a
                key={org.id}
                href={dest}
                className="group flex flex-col items-center gap-4 rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-center"
              >
                {/* Org logo or initial */}
                {org.logoUrl ? (
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-gray-500">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors leading-snug">
                    {org.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 capitalize">
                    {org.role.replace('_', ' ')}
                  </p>
                </div>

                <span className="text-xs font-medium text-blue-600 group-hover:text-blue-800">
                  Go to {isAdmin(org.role) ? 'Admin Panel' : 'My Events'} →
                </span>
              </a>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-gray-600 text-sm">
            You haven&apos;t joined any sports organization on Fieldday yet. Browse events to get started.
          </p>
          <p className="text-xs text-gray-400">
            Looking for your org? Ask your league admin for the link to your organization&apos;s page.
          </p>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">
          Not you?{' '}
          <Link href="/login" className="underline hover:text-gray-600">
            Sign in with a different account
          </Link>
        </p>
      </div>
    </div>
  )
}
