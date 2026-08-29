import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlayerCardData } from '@/lib/player-card'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { BioFlipCard } from '@/components/bios/bio-flip-card'

/**
 * The team card binder (card flip C3): the roster as a grid of full player
 * cards, each flippable in place. Same access as the team page — team
 * members and org admins.
 */
export default async function TeamCardsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceRoleClient()
  const [{ data: branding }, { data: team }, { data: myMembership }, { data: orgMember }] = await Promise.all([
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
    db.from('teams').select('id, name').eq('id', teamId).eq('organization_id', org.id).maybeSingle(),
    db.from('team_members').select('id').eq('team_id', teamId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
  ])
  if (!team) notFound()
  const isOrgAdmin = ['org_admin', 'league_admin'].includes(orgMember?.role ?? '')
  if (!myMembership && !isOrgAdmin) notFound()

  const { data: members } = await db
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('status', 'active')
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string).filter(Boolean))]

  const cards = (await Promise.all(userIds.map((id) => getPlayerCardData(db, org.id, id))))
    .map((card, i) => ({ card, userId: userIds[i] }))
    .filter((c): c is { card: NonNullable<typeof c.card>; userId: string } => !!c.card)
    .sort((a, b) => a.card.bio.name.localeCompare(b.card.bio.name))

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="flex-1 mx-auto w-full max-w-4xl px-4 py-8">
        <Link href={`/teams/${teamId}`} className="text-sm text-gray-500 hover:underline">← {team.name}</Link>
        <h1 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          🃏 {team.name} — Card Binder
        </h1>
        <p className="text-sm text-gray-500 mt-1">Tap any card to flip it over.</p>

        {cards.length === 0 ? (
          <p className="mt-10 text-center text-sm text-gray-400">No players on the roster yet.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {cards.map(({ card, userId }) => (
              <div key={userId}>
                <BioFlipCard bio={card.bio} career={card.career} />
                <p className="mt-1 text-right">
                  <Link href={`/players/${userId}/card`} className="text-xs text-gray-400 hover:underline">
                    Open card →
                  </Link>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
