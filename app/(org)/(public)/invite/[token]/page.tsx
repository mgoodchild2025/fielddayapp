import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { InviteActions } from '@/components/teams/invite-actions'
import { getInviteDetails } from '@/actions/invitations'
import Link from 'next/link'

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ action?: string }>
}) {
  const { token } = await params
  const { action } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const [invite, { data: branding }, supabase] = await Promise.all([
    getInviteDetails(token),
    (await import('@/lib/supabase/server')).createServerClient().then((s) =>
      s.from('org_branding').select('logo_url').eq('organization_id', org.id).single()
    ),
    createServerClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  if (!invite) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={null} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-2xl font-bold mb-2">Invite Not Found</p>
          <p className="text-gray-500 text-sm">This invitation link is invalid or has expired.</p>
          <Link href="/my-teams" className="mt-6 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
            My Teams →
          </Link>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const isExpired = new Date(invite.expires_at) < new Date()
  const isInactive = invite.status !== 'pending'

  const roleBadgeClass: Record<string, string> = {
    captain: 'bg-blue-100 text-blue-700',
    coach: 'bg-purple-100 text-purple-700',
    player: 'bg-green-100 text-green-700',
    sub: 'bg-gray-100 text-gray-600',
  }

  const logoUrl = (branding as { logo_url?: string | null } | null)?.logo_url ?? null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-xl border shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
              style={{ backgroundColor: 'var(--brand-primary)', opacity: 0.1 }}>
            </div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Team Invitation</p>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {invite.team_name}
            </h1>
            {invite.inviter_name && (
              <p className="text-sm text-gray-500 mt-1">Invited by {invite.inviter_name}</p>
            )}
            <span className={`inline-block mt-2 text-xs px-2.5 py-0.5 rounded-full font-medium ${roleBadgeClass[invite.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {invite.role}
            </span>
          </div>

          {(isExpired || (isInactive && invite.status !== 'accepted')) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center text-sm text-red-700">
              {isExpired ? 'This invitation has expired.' : 'This invitation is no longer active.'}
            </div>
          )}

          {invite.status === 'accepted' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center text-sm text-green-700">
              ✓ This invitation has already been accepted.
              <Link href="/my-teams" className="block mt-1 text-green-600 hover:underline">My Teams</Link>
            </div>
          )}

          {!isExpired && !isInactive && (
            <>
              <p className="text-sm text-gray-600 text-center">
                You&apos;ve been invited to join <strong>{invite.team_name}</strong> on <strong>{org.name}</strong>.
              </p>

              {!user ? (
                <div className="mt-6">
                  <p className="text-sm text-gray-500 text-center mb-4">
                    Sign in to accept or decline this invitation.
                  </p>
                  <Link
                    href={`/login?redirect=/invite/${token}`}
                    className="w-full block text-center py-3 rounded-lg font-bold text-white"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Sign In to Accept
                  </Link>
                  <Link
                    href={`/register?redirect=/invite/${token}`}
                    className="w-full block text-center py-2.5 mt-2 rounded-lg font-semibold text-gray-600 text-sm border border-gray-200 hover:bg-gray-50"
                  >
                    Create Account
                  </Link>
                </div>
              ) : (
                <InviteActions token={token} />
              )}
            </>
          )}
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
