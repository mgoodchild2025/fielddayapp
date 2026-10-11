import type { Metadata } from 'next'
import { BackLink } from '@/components/ui/back-link'
import { DoorSign } from '@/components/door/door-printables'
import { loadPrintableStation } from '../load'

export const metadata: Metadata = { title: 'Door sign' }

export default async function DoorSignPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params
  const { station, origin, brand } = await loadPrintableStation(stationId)
  return (
    <div className="max-w-5xl">
      <div className="print:hidden mb-4">
        <BackLink fallbackHref="/admin/settings/door-alert" fallbackLabel="Door Alert" />
        <h1 className="text-2xl font-bold mt-1">Door sign — {station.name}</h1>
      </div>
      <DoorSign brand={brand} visitorUrl={`${origin}/door/${station.public_token}`} />
    </div>
  )
}
