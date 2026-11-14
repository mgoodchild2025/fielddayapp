import { headers } from 'next/headers'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { ScorekeeperInviteAccept } from '@/components/events/scorekeeper-invite-accept'
import { getScorekeeperInvite } from '@/actions/scorekeepers'

export const metadata: Metadata = { title: 'Scorekeeper invite' }

/**
 * A volunteer's scorekeeper invitation. Accepting is a button, never the GET
 * (mail scanners open every link), and only the invited address can take it.
 */
export default async function ScorekeeperInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const supabase = await createServerClient()
  const [invite, { data: { user } }, { data: branding }] = await Promise.all([
    getScorekeeperInvite(token),
    supabase.auth.getUser(),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
  ])
  const returnPath = `/scorekeeper-invite/${token}`
  const wrongAccount = !!invite && !!user && (user.email ?? '').toLowerCase() !== invite.email.toLowerCase()

  let body: React.ReactNode
  if (!invite) {
    body = (
      <div className="text-center">
        <h1 className="text-xl font-bold mb-2">Invitation not found</h1>
        <p className="text-sm text-gray-500">This link is invalid. Ask the organiser to send a new one.</p>
      </div>
    )
  } else {
    body = (
      <>
        <div className="text-center mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Scorekeeper invitation</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>{invite.leagueName}</h1>
          <p className="text-sm text-gray-500 mt-1">{org.name}{invite.inviterName ? ` · from ${invite.inviterName}` : ''}</p>
        </div>

        {invite.status === 'active' ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">✓ You’re a scorekeeper for this event.</p>
            <Link href="/scorekeeping" className="press w-full flex items-center justify-center min-h-11 rounded-lg font-semibold text-sm bg-brand-primary text-on-brand">
              Open Scorekeeping
            </Link>
          </div>
        ) : invite.status === 'removed' || invite.expired ? (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
            {invite.expired ? 'This invitation has expired.' : 'This invitation is no longer active.'}
            <span className="block mt-1 text-gray-600">Ask the organiser who invited you to send a new one.</span>
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 text-center">
              You’ve been asked to enter scores for <strong>{invite.leagueName}</strong>. On game day, open
              Scorekeeping from your Home screen to see the day’s games and enter each result. You won’t see
              anything else of the organisers’ tools.
            </p>
            <div className="mt-6">
              {!user ? (
                <div className="space-y-2">
                  <Link href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                    className="press w-full flex items-center justify-center min-h-11 rounded-lg font-semibold text-sm bg-brand-primary text-on-brand">
                    Sign in to accept
                  </Link>
                  <Link href={`/register?redirect=${encodeURIComponent(returnPath)}`}
                    className="press w-full flex items-center justify-center min-h-11 rounded-lg font-semibold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50">
                    Create an account
                  </Link>
                  <p className="text-xs text-gray-500 text-center pt-1">
                    Use <strong className="break-all">{invite.email}</strong>, the address this invitation was sent to.
                  </p>
                </div>
              ) : wrongAccount ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    This invitation was sent to <strong className="break-all">{invite.email}</strong>, but you’re signed in as <strong className="break-all">{user.email}</strong>.
                  </p>
                  <SignOutButton
                    next={`/login?redirect=${encodeURIComponent(returnPath)}`}
                    label={`Sign in as ${invite.email}`}
                    className="press w-full flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg font-semibold text-sm bg-brand-primary text-on-brand"
                  />
                  <p className="text-xs text-gray-500">Not you? Ask the organiser to invite {user.email} instead.</p>
                </div>
              ) : (
                <ScorekeeperInviteAccept token={token} />
              )}
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
        <div className="max-w-md mx-auto w-full px-4 py-12">
          <div className="bg-white rounded-xl border shadow-sm p-8">{body}</div>
        </div>
      </main>
      <Footer org={org} />
    </div>
  )
}
