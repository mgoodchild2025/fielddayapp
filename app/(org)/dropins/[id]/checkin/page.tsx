import { createServiceRoleClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import { CheckInScanner } from './check-in-scanner'

export default async function DropInCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const { data: session } = await supabase
    .from('drop_in_sessions')
    .select('id, name, scheduled_at')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!session) notFound()

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-1">{session.name}</h1>
        <p className="text-center text-sm text-gray-500 mb-8">
          {new Date(session.scheduled_at).toLocaleString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        <CheckInScanner sessionId={id} />
      </div>
    </div>
  )
}
