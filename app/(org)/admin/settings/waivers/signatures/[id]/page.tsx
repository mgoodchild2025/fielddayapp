import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'

export default async function WaiverSignaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sig } = await (db as any)
    .from('waiver_signatures')
    .select(`
      id, signed_at, signature_name, ip_address,
      player:profiles!waiver_signatures_user_id_fkey(full_name, email, phone),
      waiver:waivers!waiver_signatures_waiver_id_fkey(id, title, version, content),
      league:leagues!waiver_signatures_league_id_fkey(id, name, slug)
    `)
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!sig) notFound()

  const player = Array.isArray(sig.player) ? sig.player[0] : sig.player
  const waiver = Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver
  const league = Array.isArray(sig.league) ? sig.league[0] : sig.league

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/admin/settings/waivers/signatures" className="text-sm text-gray-400 hover:text-gray-600">
          ← Signed Waivers
        </Link>
        <h1 className="text-2xl font-bold mt-1">{waiver?.title ?? 'Waiver'}</h1>
      </div>

      {/* Signature metadata */}
      <div className="bg-white rounded-lg border p-5 mb-6 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-500">Signature Record</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Player</dt>
            <dd className="font-medium">{player?.full_name ?? '—'}</dd>
            {player?.email && <dd className="text-gray-500 text-xs">{player.email}</dd>}
            {player?.phone && <dd className="text-gray-500 text-xs">{player.phone}</dd>}
          </div>
          <div>
            <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Event</dt>
            <dd>
              {league ? (
                <Link
                  href={`/admin/events/${league.id}`}
                  className="font-medium hover:underline"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  {league.name}
                </Link>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Signed At</dt>
            <dd className="font-medium">
              {new Date(sig.signed_at).toLocaleDateString('en-CA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
            <dd className="text-gray-500 text-xs">
              {new Date(sig.signed_at).toLocaleTimeString('en-CA', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Signature</dt>
            <dd className="font-medium italic text-lg" style={{ fontFamily: 'Georgia, serif' }}>
              {sig.signature_name}
            </dd>
          </div>
          {sig.ip_address && (
            <div>
              <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">IP Address</dt>
              <dd className="text-gray-600 font-mono text-xs">{sig.ip_address}</dd>
            </div>
          )}
          {waiver?.version && (
            <div>
              <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Waiver Version</dt>
              <dd className="text-gray-600">v{waiver.version}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Waiver text as it was when signed */}
      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-3">{waiver?.title}</h2>
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border rounded-md p-4 bg-gray-50 max-h-[600px] overflow-y-auto">
          {waiver?.content ?? '—'}
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Agreed & signed by</p>
            <p className="font-semibold italic text-base mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
              {sig.signature_name}
            </p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <p>{new Date(sig.signed_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p>{new Date(sig.signed_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
