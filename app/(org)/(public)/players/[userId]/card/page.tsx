import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth, getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlayerCardData } from '@/lib/player-card'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { BioFlipCard } from '@/components/bios/bio-flip-card'
import { CopyLinkButton } from '@/components/bios/copy-link-button'
import { BackLink } from '@/components/ui/back-link'

/**
 * The shareable card page (card flip C3): one player's full-size flippable
 * card at a stable URL — the target of "look at my card" texts.
 *
 * Visibility is CONSENT-GATED by the player's own lever: show_on_displays —
 * the same opt-in that puts their card on public gym TVs — also makes this
 * page public, so a shared link works for people without accounts. Without
 * the opt-in (or when admin-hidden), it stays logged-in org members only,
 * matching the roster modal.
 */
export default async function PlayerCardPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const db = createServiceRoleClient()
  const { data: consent } = await db
    .from('player_bios')
    .select('show_on_displays, hidden_by_admin')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .maybeSingle()
  const isPublicCard = consent?.show_on_displays === true && consent?.hidden_by_admin !== true
  if (!isPublicCard) await requireAuth()
  const viewer = await getCurrentUser()
  const [card, { data: branding }] = await Promise.all([
    getPlayerCardData(db, org.id, userId),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
  ])
  if (!card) notFound()

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="flex-1 mx-auto w-full max-w-md px-4 py-10">
        <BioFlipCard bio={card.bio} career={card.career} />
        <div className="mt-4 flex items-center justify-between gap-3">
          {/* A shared card is mostly opened by other people — only its owner goes "home". */}
          {viewer?.id === userId
            ? <BackLink fallbackHref="/dashboard" fallbackLabel="Home" />
            : <BackLink fallbackHref="/" fallbackLabel={org.name} />}
          <CopyLinkButton />
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
