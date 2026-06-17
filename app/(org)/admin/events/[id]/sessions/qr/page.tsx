import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { RegistrationQrPoster } from '@/components/sessions/registration-qr-poster'

export const dynamic = 'force-dynamic'

export default async function SessionsQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ session?: string }>
}) {
  const { id } = await params
  const { session } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, slug, drop_in_price_cents, price_cents, currency')
    .eq('id', id).eq('organization_id', org.id).single()
  if (!league) notFound()

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const base = `https://${org.slug}.${platformDomain}`
  const sessionParam = session ? `&session=${encodeURIComponent(session)}` : ''
  const url = `${base}/register/${league.slug}?mode=drop_in${sessionParam}`

  const priceCents: number = league.drop_in_price_cents ?? league.price_cents ?? 0
  const priceLabel = priceCents > 0 ? `$${(priceCents / 100).toFixed(2)}` : null

  return (
    <div className="py-6">
      <div className="mb-6 print:hidden">
        <Link href={`/admin/events/${id}/sessions`} className="text-sm text-gray-400 hover:text-gray-600">← Sessions</Link>
        <p className="text-sm text-gray-500 mt-1">
          Print this and post it at the venue, or display it fullscreen on your phone for players to scan.
        </p>
      </div>

      <RegistrationQrPoster url={url} eventName={league.name} priceLabel={priceLabel} />
    </div>
  )
}
