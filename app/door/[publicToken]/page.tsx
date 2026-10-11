import { notFound } from 'next/navigation'
import { doorBrand, doorBrandStyle } from '@/lib/door/brand'
import { doorOrgId, stationByPublicToken } from '@/lib/door/service'
import { DoorStripes } from '@/components/door/door-stripes'
import { VisitorRing } from '@/components/door/visitor-ring'

export const metadata = { title: 'Ring the door' }

/** What the visitor QR on the door sign opens. Public, no login. */
export default async function DoorVisitorPage({ params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params
  const orgId = await doorOrgId()
  if (!orgId) notFound()
  const station = await stationByPublicToken(orgId, publicToken)
  if (!station) notFound()
  const brand = await doorBrand(orgId)

  return (
    <main className="min-h-dvh flex flex-col bg-[#0B0B0C] text-white" style={doorBrandStyle(brand)}>
      <DoorStripes className="h-4" />
      <div className="flex-1 w-full max-w-md mx-auto px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col gap-8">
        <header className="flex items-center gap-3">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
          )}
          <p className="text-sm font-semibold text-white/85">{brand.orgName}</p>
        </header>
        <VisitorRing
          publicToken={publicToken}
          locationLabel={station.location_label}
          initiallyArmed={station.is_armed}
          initialFallback={station.fallback_message}
        />
      </div>
      <DoorStripes className="h-2" />
    </main>
  )
}
