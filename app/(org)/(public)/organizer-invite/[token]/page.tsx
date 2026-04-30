import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { OrganizerInviteActions } from '@/components/events/organizer-invite-actions'
import { getOrganizerInviteDetails } from '@/actions/organizers'
import Link from 'next/link'

export default async function OrganizerInvitePage({
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

  const [invite, supabase, { data: branding }] = await Promise.all([
    getOrganizerInviteDetails(token),
    createServerClient(),
    (await import('@/lib/supabase/server')).createServerClient().then((s) =>
      s.from('org_branding').select('logo_url').eq('organization_id', org.id).single()
    ),
  ])

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const logoUrl = (branding as { logo_url?: string | null } | null)?.logo_url ?? null

  if (!invite) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-2xl font-bold mb-2">Invitation Not Found</p>
          <p className="text-gray-500 text-sm">This invitation link is invalid or has already been used.</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-sm font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Go to Dashboard →
          </Link>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  // Handle inline decline action (from email link ?action=decline)
  if (action === 'decline' && invite.status === 'pending') {
    const { declineOrganizerInvitation } = await import('@/actions/organizers')
    await declineOrganizerInvitation(token)
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-2xl font-bold mb-2">Invitation Declined</p>
          <p className="text-gray-500 text-sm">You&apos;ve declined the invitation to co-organize {invite.league_name}.</p>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const isExpired = new Date(invite.expires_at) < new Date()
  const isInactive = invite.status !== 'pending'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-xl border shadow-sm p-8">
          <div className="text-center mb-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Co-Organizer Invitation
            </p>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: 'var(--brand-heading-font)' }}
            >
              {invite.league_name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{org.name}</p>
            {invite.inviter_name && (
              <p className="text-sm text-gray-500 mt-1">Invited by {invite.inviter_name}</p>
            )}
          </div>

          {(isExpired || (isInactive && invite.status !== 'active')) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center text-sm text-red-700">
              {isExpired
                ? 'This invitation has expired.'
                : invite.status === 'declined'
                ? 'This invitation has already been declined.'
                : 'This invitation is no longer active.'}
            </div>
          )}

          {invite.status === 'active' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center text-sm text-green-700">
              ✓ This invitation has already been accepted.
              {user && (
                <Link
                  href={`/admin/events/${invite.league_id}`}
                  className="block mt-1 text-green-600 hover:underline"
                >
                  Go to Event →
                </Link>
              )}
            </div>
          )}

          {!isExpired && !isInactive && (
            <>
              <p className="text-sm text-gray-600 text-center">
                You&apos;ve been invited to help organize{' '}
                <strong>{invite.league_name}</strong>. As a co-organizer, you can view
                rosters, manage teams, and communicate with players.
              </p>

              {!user ? (
                <div className="mt-6">
                  <p className="text-sm text-gray-500 text-center mb-4">
                    Sign in to accept or decline this invitation.
                  </p>
                  <Link
                    href={`/login?redirect=/organizer-invite/${token}`}
                    className="w-full block text-center py-3 rounded-lg font-bold text-white"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Sign In to Accept
                  </Link>
                  <Link
                    href={`/register?redirect=/organizer-invite/${token}`}
                    className="w-full block text-center py-2.5 mt-2 rounded-lg font-semibold text-gray-600 text-sm border border-gray-200 hover:bg-gray-50"
                  >
                    Create Account
                  </Link>
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Use the email address this invitation was sent to.
                  </p>
                </div>
              ) : (
                <OrganizerInviteActions token={token} />
              )}
            </>
          )}
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
