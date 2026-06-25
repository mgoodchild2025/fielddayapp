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

  const [canSms, { data: interestRowsRaw }, { data: branding }, { data: promosRaw }] = await Promise.all([
    canAccess(org.id, 'sms_notifications'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_interest')
      .select('id, name, email, created_at, notified_at, unsubscribed_at')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).maybeSingle(),
    // Promotions previously sent for this event (so admins can see what went out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('announcements')
      .select('id, title, body, audience_type, channel, sent_at, scheduled_for, created_at')
      .eq('organization_id', org.id)
      .eq('league_id', id)
      .eq('message_class', 'commercial')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const interestRows = (interestRowsRaw ?? []) as InterestRow[]
  const activeCount = interestRows.filter((r) => !r.unsubscribed_at).length
  const timezone = branding?.timezone ?? 'America/Toronto'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promos = (promosRaw ?? []) as any[]
  const AUDIENCE_LABEL: Record<string, string> = {
    marketing: 'Marketing opt-ins', past_participants: 'Past participants', event_interest: 'Notify-me list',
    org: 'All members', league: 'Registrants', team: 'Team', players: 'Selected players',
  }
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })

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
          lastSubject={promos[0]?.title ?? null}
          lastBody={promos[0]?.body ?? null}
        />
      </div>

      <div className="border-t pt-6 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">Recent promotions</h3>
        {promos.length === 0 ? (
          <div className="bg-white border rounded-lg px-6 py-8 text-center text-gray-400 text-sm">
            No promotions sent yet — messages you send above will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {promos.map((p) => {
              const when = p.sent_at
                ? `Sent ${fmtWhen(p.sent_at)}`
                : (p.scheduled_for ? `Scheduled for ${fmtWhen(p.scheduled_for)}` : `Created ${fmtWhen(p.created_at)}`)
              return (
                <div key={p.id} className="bg-white border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900">{p.title}</p>
                    <span className="text-xs text-gray-400 shrink-0">{when}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{AUDIENCE_LABEL[p.audience_type] ?? p.audience_type}</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{p.channel}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap max-h-40 overflow-auto">{p.body}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t pt-6">
        <EventInterestManager leagueId={league.id} rows={interestRows} timezone={timezone} />
      </div>
    </div>
  )
}
