import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { getNavLinks } from '@/actions/nav-links'
import { NavLinkManager } from '@/components/settings/nav-link-manager'

export default async function NavLinksPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const links = await getNavLinks(org.id)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1 text-sm text-gray-400">
        <Link href="/admin/settings" className="hover:text-gray-600 transition-colors">Settings</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Navigation</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Navigation Links</h1>
      <p className="text-sm text-gray-500 mb-6">
        Add up to 5 custom links to your public navigation bar. Links can point to a URL or an uploaded PDF document (eg. Social media site, Policy statement, Game video archive, etc.).
      </p>
      <NavLinkManager initialLinks={links} />
    </div>
  )
}
