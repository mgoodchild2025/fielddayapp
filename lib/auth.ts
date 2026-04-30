import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import type { OrgContext } from '@/lib/tenant'

export type OrgRole = 'org_admin' | 'league_admin' | 'captain' | 'player'

/**
 * Require the current user to be authenticated and an active member of the org.
 * Redirects to /login if not authenticated or not a member.
 * Returns { user, member } on success.
 */
export async function requireOrgMember(org: OrgContext, allowedRoles?: OrgRole[]) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('id, role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member) redirect('/login')

  if (allowedRoles && !allowedRoles.includes(member.role as OrgRole)) {
    redirect('/dashboard')
  }

  return { user, member: member as { id: string; role: OrgRole } }
}

/**
 * Require the user to be authenticated (any logged-in user, no org membership check).
 * Use this for public-facing org pages (Leagues, Schedule, Standings).
 * Redirects to /login if not authenticated.
 */
export async function requireAuth() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') ?? ''
    const returnTo = pathname && pathname !== '/login' ? `?redirect=${encodeURIComponent(pathname)}` : ''
    redirect(`/login${returnTo}`)
  }
  return user
}

/**
 * Get the current user without throwing — returns null if unauthenticated.
 */
export async function getCurrentUser() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
