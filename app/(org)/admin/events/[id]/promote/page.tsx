import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { PromoteEventForm } from '@/components/events/promote-event'
import { EventInterestManager, type InterestRow } from '@/components/events/event-interest-manager'

export default async function PromoteEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, slug')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!league) notFound()

  const [canSms, { data: interestRowsRaw }, { data: branding }] = await Promise.all([
    canAccess(org.id, 'sms_notifications'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_interest')
      .select('id, name, email, created_at, notified_at, unsubscribed_at')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle(),
  ])

  const interestRows = (interestRowsRaw ?? []) as InterestRow[]
  const activeCount = interestRows.filter((r) => !r.unsubscribed_at).length
  const timezone = branding?.timezone ?? 'America/Toronto'

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const registerUrl = `https://${org.slug}.${platformDomain}/events/${league.slug}`

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Promote this event</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Send a promotional email{canSms ? ' or SMS' : ''} to your warm audience to drive registrations.
          </p>
        </div>
        <PromoteEventForm
          leagueId={league.id}
          eventName={league.name}
          registerUrl={registerUrl}
          canSms={canSms}
          interestCount={activeCount}
        />
      </div>

      <div className="border-t pt-6">
        <EventInterestManager leagueId={league.id} rows={interestRows} timezone={timezone} />
      </div>
    </div>
  )
}
