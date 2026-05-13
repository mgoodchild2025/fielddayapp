import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
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

  const db = createServiceRoleClient()
  const [invite, { data: branding }, supabase] = await Promise.all([
    getInviteDetails(token),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    createServerClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  const logoUrl = (branding as { logo_url?: string | null } | null)?.logo_url ?? null

  if (!invite) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-2xl font-bold">Invite Not Found</p>
          <p className="text-gray-500 text-sm">This invitation link is invalid or has expired.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
            ← Back to home
          </Link>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const isExpired = new Date(invite.expires_at) < new Date()
  const isInactive = invite.status !== 'pending'
  const teamColor = invite.team_color ?? '#6b7280'
  const returnPath = `/invite/${token}`

  const roleBadgeClass: Record<string, string> = {
    captain: 'bg-blue-100 text-blue-700',
    coach: 'bg-purple-100 text-purple-700',
    player: 'bg-green-100 text-green-700',
    sub: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />

      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {/* Team colour bar */}
          <div className="h-2" style={{ backgroundColor: teamColor }} />

          {/* Team identity */}
          <div className="px-6 py-8 text-center space-y-1">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4"
              style={{ backgroundColor: teamColor }}
            >
              {invite.team_name.charAt(0).toUpperCase()}
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{org.name}</p>
            <h1 className="text-2xl font-bold text-gray-900">{invite.team_name}</h1>
            {invite.league_name && (
              <p className="text-sm text-gray-500">{invite.league_name}</p>
            )}
            {invite.max_team_size != null && (
              <p className="text-xs text-gray-400 mt-1">
                {invite.member_count} / {invite.max_team_size} players
              </p>
            )}
          </div>

          <div className="px-6 pb-8 space-y-4">
            {/* Invite-specific context */}
            <div className="text-center space-y-2">
              {invite.inviter_name && (
                <p className="text-sm text-gray-500">Invited by <strong className="text-gray-700">{invite.inviter_name}</strong></p>
              )}
              <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${roleBadgeClass[invite.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {invite.role}
              </span>
            </div>

            {/* Status messages */}
            {(isExpired || (isInactive && invite.status !== 'accepted')) && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center text-sm text-red-700">
                {isExpired ? 'This invitation has expired.' : 'This invitation is no longer active.'}
              </div>
            )}

            {invite.status === 'accepted' && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  ✓ You&apos;re already on this team.
                </p>
                <Link
                  href={`/teams/${invite.team_id}`}
                  className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  View Team →
                </Link>
              </div>
            )}

            {/* Action area */}
            {!isExpired && !isInactive && (
              !user ? (
                <div className="space-y-3">
                  <Link
                    href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                    className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Sign in to accept
                  </Link>
                  <Link
                    href={`/register?redirect=${encodeURIComponent(returnPath)}`}
                    className="block w-full py-2.5 rounded-lg font-semibold text-sm text-center border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Create account
                  </Link>
                  <p className="text-center text-xs text-gray-400">
                    You need an account to accept this invitation.
                  </p>
                </div>
              ) : (
                <InviteActions token={token} />
              )
            )}
          </div>
        </div>
      </div>

      <Footer org={org} />
    </div>
  )
}
