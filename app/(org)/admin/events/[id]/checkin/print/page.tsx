import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { PrintQrCode } from '@/components/checkin/print-qr-code'

function formatSessionLabel(scheduledAt: string, timezone: string): string {
  return new Date(scheduledAt).toLocaleString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export default async function CheckInPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string; sessionId?: string }>
}) {
  const { id } = await params
  const { type, sessionId } = await searchParams
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Determine the public-facing origin from request headers
  const host = headersList.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

  const [leagueRes, brandingRes, orgRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, event_type').eq('id', id).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations').select('name').eq('id', org.id).single(),
  ])

  const league = leagueRes.data
  if (!league) notFound()

  const timezone = brandingRes.data?.timezone ?? 'America/Toronto'
  const orgName: string = orgRes.data?.name ?? org.slug

  const isSessionType = type === 'session' && sessionId

  // For session-based QR
  let sessionLabel: string | null = null
  let checkinUrl: string

  if (isSessionType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session } = await (db as any)
      .from('event_sessions')
      .select('id, scheduled_at')
      .eq('id', sessionId)
      .eq('organization_id', org.id)
      .single()

    if (!session) notFound()
    sessionLabel = formatSessionLabel(session.scheduled_at, timezone)
    checkinUrl = `${origin}/checkin/session/${sessionId}`
  } else {
    checkinUrl = `${origin}/checkin/event/${id}`
  }

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 px-6 py-8 print:bg-white print:p-0">
        <PrintQrCode
          checkinUrl={checkinUrl}
          eventName={league.name}
          sessionLabel={sessionLabel}
          orgName={orgName}
        />
      </div>
    </>
  )
}
