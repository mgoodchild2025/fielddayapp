import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { WaiverQrPoster } from '@/components/waivers/waiver-qr-poster'

export default async function WaiverQrPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, slug, waiver_version_id')
    .eq('slug', slug)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()

  // Verify org has a waiver
  const waiverId = (league as { waiver_version_id?: string | null }).waiver_version_id
  const { data: waiver } = waiverId
    ? await db.from('waivers').select('title').eq('id', waiverId).single()
    : await db.from('waivers').select('title').eq('organization_id', org.id).eq('is_active', true).single()

  if (!waiver) notFound()

  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'https'
  const waiverUrl = `${proto}://${host}/events/${slug}/waiver`

  return (
    <WaiverQrPoster
      waiverUrl={waiverUrl}
      leagueName={(league as { name: string }).name}
      orgName={org.name}
      waiverTitle={(waiver as { title: string }).title}
    />
  )
}
