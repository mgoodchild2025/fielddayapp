import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'

export default async function WaiverSignaturesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { data: branding } = await db
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Query from registrations so each registration's waiver appears as a separate row.
  // A player who registers for two events using the same waiver template shares one
  // waiver_signatures row (unique constraint), so querying waiver_signatures directly
  // would under-count. Joining from registrations gives the correct per-event view.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regs } = await (db as any)
    .from('registrations')
    .select(`
      id,
      waiver_signature_id,
      player:profiles!registrations_user_id_fkey(full_name, email),
      league:leagues!registrations_league_id_fkey(name),
      signature:waiver_signatures!registrations_waiver_signature_id_fkey(
        id, signed_at, signature_name, ip_address, guardian_relationship,
        waiver:waivers!waiver_signatures_waiver_id_fkey(title, version)
      )
    `)
    .eq('organization_id', org.id)
    .not('waiver_signature_id', 'is', null)
    .order('created_at', { ascending: false })

  type Row = {
    id: string
    waiver_signature_id: string
    player: { full_name: string; email: string } | { full_name: string; email: string }[] | null
    league: { name: string } | { name: string }[] | null
    signature: {
      id: string
      signed_at: string
      signature_name: string
      ip_address: string | null
      guardian_relationship: string | null
      waiver: { title: string; version: number } | { title: string; version: number }[] | null
    } | {
      id: string
      signed_at: string
      signature_name: string
      ip_address: string | null
      guardian_relationship: string | null
      waiver: { title: string; version: number } | { title: string; version: number }[] | null
    }[] | null
  }

  const rows = (regs ?? []) as Row[]

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/admin/settings/waivers" className="text-sm text-gray-400 hover:text-gray-600">
          ← Waivers
        </Link>
        <h1 className="text-2xl font-bold mt-1">Signed Waivers</h1>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} signature{rows.length !== 1 ? 's' : ''} on record
        </p>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">Event</th>
                <th className="px-4 py-3 font-medium text-gray-500">Waiver</th>
                <th className="px-4 py-3 font-medium text-gray-500">Signed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((reg) => {
                const player = Array.isArray(reg.player) ? reg.player[0] : reg.player
                const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
                const sig = Array.isArray(reg.signature) ? reg.signature[0] : reg.signature
                const waiver = sig ? (Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver) : null
                const isGuardian = !!sig?.guardian_relationship
                const guardianLabel = sig?.guardian_relationship === 'legal_guardian' ? 'Legal guardian' : 'Parent'
                return (
                  <tr key={reg.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{player?.full_name ?? '—'}</span>
                        {isGuardian && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            👤 Minor
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{player?.email ?? '—'}</div>
                      {isGuardian && sig && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Signed by {sig.signature_name} ({guardianLabel})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {league?.name ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{waiver?.title ?? '—'}</div>
                      {waiver?.version && (
                        <div className="text-xs text-gray-400">v{waiver.version}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {sig ? (
                        <>
                          {new Date(sig.signed_at).toLocaleDateString('en-CA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            timeZone: timezone,
                          })}
                          <br />
                          {new Date(sig.signed_at).toLocaleTimeString('en-CA', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: timezone,
                          })}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sig && (
                        <Link
                          href={`/admin/settings/waivers/signatures/${sig.id}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    No signed waivers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
