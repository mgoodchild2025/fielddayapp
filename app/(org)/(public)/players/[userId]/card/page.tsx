import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlayerCardData } from '@/lib/player-card'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { BioFlipCard } from '@/components/bios/bio-flip-card'
import { CopyLinkButton } from '@/components/bios/copy-link-button'

/**
 * The shareable card page (card flip C3): one player's full-size flippable
 * card at a stable URL — the target of "look at my card" texts. Logged-in
 * org members only (requireAuth), same visibility as the roster modal.
 */
export default async function PlayerCardPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireAuth()

  const db = createServiceRoleClient()
  const [card, { data: branding }] = await Promise.all([
    getPlayerCardData(db, org.id, userId),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
  ])
  if (!card) notFound()

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="flex-1 mx-auto w-full max-w-md px-4 py-10">
        <BioFlipCard bio={card.bio} career={card.career} />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">← Dashboard</Link>
          <CopyLinkButton />
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
