import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { SelfCheckinSessionClient } from '@/components/checkin/self-checkin-session-client'

function formatSessionTime(scheduledAt: string, timezone: string): string {
  return new Date(scheduledAt).toLocaleString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export default async function SelfCheckInSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/checkin/session/${sessionId}`)
  }

  const db = createServiceRoleClient()

  const [{ data: branding }, { data: session }, { data: profile }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, timezone, checkin_sound').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('event_sessions')
      .select('id, scheduled_at, league_id, league:leagues!event_sessions_league_id_fkey(name)')
      .eq('id', sessionId)
      .eq('organization_id', org.id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  const timezone = branding?.timezone ?? 'America/Toronto'
  const checkinSound: string | null = branding?.checkin_sound ?? null
  const playerName: string = profile?.full_name ?? 'You'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueData = session ? (Array.isArray(session.league) ? session.league[0] : session.league) as any : null
  const leagueName: string = leagueData?.name ?? 'Pickup Session'

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800">Session not found</h1>
            <p className="text-gray-500 text-sm">This check-in link may be invalid.</p>
          </div>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const sessionLabel = formatSessionTime(session.scheduled_at, timezone)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <SelfCheckinSessionClient
          sessionId={sessionId}
          leagueName={leagueName}
          sessionLabel={sessionLabel}
          playerName={playerName}
          timezone={timezone}
          checkinSound={checkinSound}
        />
      </div>

      <Footer org={org} />
    </div>
  )
}
