import Link from 'next/link'
import { notFound } from 'next/navigation'
import { doorBrand, doorBrandStyle } from '@/lib/door/brand'
import { doorOrgId, stationByJoin } from '@/lib/door/service'
import { DoorStripes } from '@/components/door/door-stripes'
import { JoinForm } from '@/components/door/join-form'

export const metadata = { title: 'Join a door' }

/**
 * /door/join/<joinToken> — behind the staff QR (station known, label + JOIN).
 * /door/join             — type the 8-character code instead.
 */
export default async function DoorJoinPage({ params }: { params: Promise<{ joinToken?: string[] }> }) {
  const { joinToken: segments } = await params
  const orgId = await doorOrgId()
  if (!orgId) notFound()
  if (segments && segments.length > 1) notFound()
  const joinToken = segments?.[0] ?? null
  const [station, brand] = await Promise.all([
    joinToken ? stationByJoin(orgId, { joinToken }) : Promise.resolve(null),
    doorBrand(orgId),
  ])

  return (
    <main className="min-h-dvh flex flex-col bg-[#0B0B0C] text-white" style={doorBrandStyle(brand)}>
      <DoorStripes className="h-4" />
      <div className="flex-1 w-full max-w-md mx-auto px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {joinToken && !station ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-black uppercase">Link expired</h1>
            <p className="text-white/80">This staff join link no longer works. The admin may have issued new staff cards.</p>
            <Link href="/door/join" className="press inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/30 px-5 font-semibold">Type a join code instead</Link>
          </div>
        ) : (
          <JoinForm joinToken={station ? joinToken : null} stationName={station?.name ?? null} />
        )}
      </div>
    </main>
  )
}
