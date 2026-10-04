import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { formatGameTime } from '@/lib/format-time'
import { TokenCheckinConfirm } from '@/components/checkin/token-checkin-confirm'
import Link from 'next/link'

// Opening this page never checks anyone in: the confirmation email links here,
// and mail scanners open every link (CLAUDE.md: email links never act on GET).
// It looks the code up and offers a button.
export default async function SelfCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: branding }, { data: reg }] = await Promise.all([
    db.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    db
      .from('registrations')
      .select('id, checked_in_at, league:leagues!registrations_league_id_fkey(name), profile:profiles!registrations_user_id_fkey(full_name)')
      .eq('checkin_token', token)
      .eq('organization_id', org.id)
      .maybeSingle(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const profile = reg ? (Array.isArray(reg.profile) ? reg.profile[0] : reg.profile) : null
  const league = reg ? (Array.isArray(reg.league) ? reg.league[0] : reg.league) : null
  const playerName = profile?.full_name ?? 'Player'
  const checkedIn = reg?.checked_in_at ? formatGameTime(reg.checked_in_at, timezone) : null

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        {!reg ? (
          <div className="fd-step-in bg-white rounded-2xl border p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✗</span>
            </div>
            <h1 className="text-xl font-bold text-red-800 mb-1">QR Code Not Found</h1>
            <p className="text-sm text-gray-500">
              This check-in code isn&apos;t recognised. Your current QR code is under My Events — or ask an event organiser to check you in.
            </p>
            <Link href="/my-events" className="press inline-flex items-center justify-center min-h-11 px-5 rounded-lg font-semibold text-sm bg-brand-primary text-on-brand mt-5 w-full">Open My Events</Link>
          </div>
        ) : checkedIn ? (
          <div className="fd-step-in bg-white rounded-2xl border p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠</span>
            </div>
            <h1 className="text-xl font-bold text-amber-800 mb-1">Already checked in</h1>
            <p className="text-lg font-semibold mb-1">{playerName}</p>
            {/* With the date — on a later week "at 7:02 PM" alone read as today. */}
            <p className="text-sm text-gray-500">Checked in {checkedIn.date} at {checkedIn.time}</p>
          </div>
        ) : (
          <TokenCheckinConfirm token={token} playerName={playerName} eventName={league?.name ?? null} timezone={timezone} />
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
