import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DropInSessionForm } from '../session-form'
import { CheckInButton } from './check-in-button'
import { DeleteSessionButton } from './delete-session-button'

export default async function AdminDropInDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const [sessionRes, regsRes] = await Promise.all([
    supabase
      .from('drop_in_sessions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single(),
    supabase
      .from('drop_in_registrations')
      .select('*, profiles(full_name, email)')
      .eq('session_id', id)
      .order('created_at'),
  ])

  const session = sessionRes.data
  if (!session) notFound()

  const registrations = regsRes.data ?? []
  const registered = registrations.filter(r => r.status === 'registered' || r.status === 'attended')
  const waitlisted = registrations.filter(r => r.status === 'waitlisted')
  const attended = registrations.filter(r => r.status === 'attended')

  const orgSlug = org.slug
  const checkInUrl = `https://${orgSlug}.fielddayapp.ca/dropins/${id}/checkin`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/dropins" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Drop-in Sessions</Link>
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(session.scheduled_at).toLocaleString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {session.location && ` · ${session.location}`}
          </p>
        </div>
        <DeleteSessionButton sessionId={session.id} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Registered', value: registered.length },
          { label: 'Waitlisted', value: waitlisted.length },
          { label: 'Attended', value: attended.length },
          { label: 'Capacity', value: session.capacity },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registrations */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Registrations ({registered.length})</h2>
              <a
                href={checkInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-md text-white font-medium"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                QR Check-in ↗
              </a>
            </div>
            {registered.length === 0 && <p className="text-sm text-gray-400">No registrations yet.</p>}
            <div className="space-y-2">
              {registered.map(r => {
                const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{profile?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{profile?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.status === 'attended' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Attended</span>
                      ) : (
                        <CheckInButton registrationId={r.id} sessionId={id} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {waitlisted.length > 0 && (
            <div className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-4">Waitlist ({waitlisted.length})</h2>
              <div className="space-y-2">
                {waitlisted.map(r => {
                  const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{profile?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{profile?.email}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Edit form */}
        <div>
          <h2 className="font-semibold mb-3">Edit Session</h2>
          <DropInSessionForm session={session} />
        </div>
      </div>
    </div>
  )
}
