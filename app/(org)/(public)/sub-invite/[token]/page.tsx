import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { GameSubClient } from '@/components/schedule/game-sub-client'
import { getGameSubInviteDetails } from '@/actions/game-subs'
import { formatGameTime } from '@/lib/format-time'
import Link from 'next/link'

export default async function SubInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [invite, { data: branding }, supabase] = await Promise.all([
    getGameSubInviteDetails(token),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    createServerClient(),
  ])

  const logoUrl  = (branding as { logo_url?: string | null } | null)?.logo_url ?? null
  const timezone = (branding as { timezone?: string | null } | null)?.timezone ?? 'America/Toronto'

  // ── Not found ─────────────────────────────────────────────────────────────
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

  // ── Expired ───────────────────────────────────────────────────────────────
  if (new Date(invite.expiresAt) < new Date()) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-4xl">⏱</p>
          <p className="text-2xl font-bold">Invite Expired</p>
          <p className="text-gray-500 text-sm">This sub invite has expired. Ask your captain for a new one.</p>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const { date: gameDate, time: gameTime } = formatGameTime(invite.scheduledAt, timezone)

  // ── Not logged in ─────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const returnPath = `/sub-invite/${token}`
    const teamColor  = invite.teamColor ?? '#6b7280'

    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: teamColor }} />
            <div className="px-6 py-8 text-center space-y-1">
              {invite.teamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={invite.teamLogoUrl} alt={invite.teamName}
                  className="mx-auto w-16 h-16 rounded-full object-cover border border-gray-100 mb-4" />
              ) : (
                <div
                  className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4"
                  style={{ backgroundColor: teamColor }}
                >
                  {invite.teamName.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{org.name}</p>
              <h1 className="text-xl font-bold text-gray-900">Sub Invite — {invite.teamName}</h1>
              {invite.opponentName && (
                <p className="text-sm text-gray-500">vs {invite.opponentName}</p>
              )}
              <p className="text-sm text-gray-500 mt-1">{gameDate} · {gameTime}{invite.court ? ` · ${invite.court}` : ''}</p>
              {invite.leagueName && <p className="text-xs text-gray-400">{invite.leagueName}</p>}
            </div>

            <div className="px-6 pb-8 space-y-3">
              <p className="text-center text-sm text-gray-500">Sign in to accept or decline this invite.</p>
              <Link
                href={`/login?redirect=${encodeURIComponent(returnPath)}`}
                className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Sign in to respond
              </Link>
              <Link
                href={`/register?redirect=${encodeURIComponent(returnPath)}`}
                className="block w-full py-2.5 rounded-lg font-semibold text-sm text-center border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Create account
              </Link>
              <p className="text-center text-xs text-gray-400">
                You need an account to respond to this invitation.
              </p>
            </div>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  // ── Logged in — check for existing waiver signature ───────────────────────
  const [existingSigRes, waiverRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('waiver_signatures')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    // Fetch the org's active waiver (if any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('waivers')
      .select('id, title, content')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  const hasExistingWaiver = !!existingSigRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const waiver = (waiverRes.data as { id: string; title: string; content: string } | null) ?? null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />
      <div className="max-w-md mx-auto px-4 py-10">
        <GameSubClient
          token={token}
          invite={invite}
          gameDate={gameDate}
          gameTime={gameTime}
          waiver={waiver}
          hasExistingWaiver={hasExistingWaiver}
        />
      </div>
      <Footer org={org} />
    </div>
  )
}
