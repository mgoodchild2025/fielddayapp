import type { Metadata } from 'next'
import { BackLink } from '@/components/ui/back-link'
import { StaffCard } from '@/components/door/door-printables'
import { formatJoinCode } from '@/lib/door/tokens'
import { loadPrintableStation } from '../load'

export const metadata: Metadata = { title: 'Staff join card' }

export default async function DoorStaffCardPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params
  const { station, origin, brand } = await loadPrintableStation(stationId)
  return (
    <div className="max-w-5xl">
      <div className="print:hidden mb-4">
        <BackLink fallbackHref="/admin/settings/door-alert" fallbackLabel="Door Alert" />
        <h1 className="text-2xl font-bold mt-1">Staff join card — {station.name}</h1>
      </div>
      <StaffCard
        brand={brand}
        stationName={station.name}
        joinUrl={`${origin}/door/join/${station.join_token}`}
        joinCode={formatJoinCode(station.join_code)}
        typeUrl={`${origin}/door/join`}
      />
    </div>
  )
}
