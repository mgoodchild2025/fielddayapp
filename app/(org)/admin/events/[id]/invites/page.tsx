import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PickupInvitesManager } from '@/components/events/pickup-invites-manager'

export default async function AdminInvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const [{ data: league }, { data: invites }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('id, name, event_type, pickup_join_policy, drop_in_price_cents')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('pickup_invites')
      .select('id, email, status, invite_type, invited_at')
      .eq('league_id', id)
      .eq('organization_id', org.id)
      .order('invited_at', { ascending: false }),
  ])

  if (!league) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = league as any
  if (l.event_type !== 'pickup' && l.event_type !== 'drop_in') {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-gray-500 text-sm">
        Invites are only available for pickup and drop-in events.
      </div>
    )
  }

  return (
    <PickupInvitesManager
      leagueId={id}
      isPrivate={l.pickup_join_policy === 'private'}
      hasDropIn={l.drop_in_price_cents != null}
      initialInvites={(invites ?? []) as { id: string; email: string; status: string; invite_type: string; invited_at: string }[]}
    />
  )
}
