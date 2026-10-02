import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg, type OrgContext } from '@/lib/tenant'

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

  // Use service role for the org_members lookup — RLS on org_members requires
  // app.current_org_id to be set in the Postgres session, which the session
  // client does not provide.  Org scoping is enforced by the explicit filters.
  const db = createServiceRoleClient()
  const { data: member } = await db
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
 * Redirects to /mfa/verify if the user has enrolled MFA but hasn't verified this session.
 */
/**
 * Send a signed-out visitor to /login, coming back to the page they asked for
 * (proxy.ts puts pathname + search in x-pathname). Use this instead of a bare
 * redirect('/login') so links from alerts, emails and shares survive sign-in.
 */
export async function redirectToLogin(): Promise<never> {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const returnTo = pathname && pathname !== '/login' && !pathname.startsWith('/login?')
    ? `?redirect=${encodeURIComponent(pathname)}`
    : ''
  redirect(`/login${returnTo}`)
}

export async function requireAuth() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  // If the user has a TOTP factor enrolled but hasn't verified it this session,
  // redirect to the MFA challenge page regardless of role.
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') ?? ''
    const returnTo = pathname ? `?redirect=${encodeURIComponent(pathname)}` : ''
    redirect(`/mfa/verify${returnTo}`)
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

/**
 * Check whether the current user is an admin of the given org.
 * Intended for use inside server actions (does NOT redirect — returns an error
 * string so the action can return it to the caller).
 *
 * Returns { userId, role } on success, or { error } if unauthorized.
 */
export async function assertOrgAdmin(
  org: OrgContext,
  allowedRoles: OrgRole[] = ['org_admin', 'league_admin'],
): Promise<{ userId: string; role: OrgRole; error?: never } | { error: string; userId?: never; role?: never }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Use service role — same reason as requireOrgMember above.
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member) return { error: 'Not a member of this organization' }
  if (!allowedRoles.includes(member.role as OrgRole)) return { error: 'Insufficient permissions' }

  return { userId: user.id, role: member.role as OrgRole }
}

/**
 * Recording, editing, or refunding money is for org admins only — league
 * admins run their events but never touch payments (the admin UI hides every
 * payment control from them; this is the server-side half of that rule).
 */
export function assertPaymentAdmin(org: OrgContext) {
  return assertOrgAdmin(org, ['org_admin'])
}

/**
 * Throw unless the current session belongs to a platform admin.
 *
 * For platform-level server actions ('use server' exports are publicly
 * invokable POST endpoints — page-level gating alone does NOT protect them).
 * Canonical version of the guard previously copy-pasted across action files.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const db = createServiceRoleClient()

  const { data: profile } = await db
    .from('profiles').select('platform_role').eq('id', user.id).single()
  if (profile?.platform_role !== 'platform_admin') throw new Error('Platform admin required')

  return { userId: user.id, email: user.email ?? null }
}

/**
 * Guard for private data loaders exported from 'use server' files (each export
 * there is a public endpoint that takes ids from its caller): the caller must
 * be an active admin of the CURRENT org (proxy x-org-id); a passed orgId must
 * be that org, and a passed leagueId must be one of its events. Throws —
 * loaders return data, and pages render ErrorScreen.
 */
export async function requireCurrentOrgAdmin(
  opts: { orgId?: string; leagueId?: string } = {},
  allowedRoles: OrgRole[] = ['org_admin', 'league_admin'],
): Promise<OrgContext> {
  const org = await getCurrentOrg(await headers())
  if (opts.orgId && opts.orgId !== org.id) throw new Error('Unauthorized')
  const auth = await assertOrgAdmin(org, allowedRoles)
  if (auth.error) throw new Error('Unauthorized')
  if (opts.leagueId) {
    const { data: league } = await createServiceRoleClient()
      .from('leagues').select('id').eq('id', opts.leagueId).eq('organization_id', org.id).maybeSingle()
    if (!league) throw new Error('Unauthorized')
  }
  return org
}
