import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'

export default async function WaiverSignaturesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: signatures } = await (db as any)
    .from('waiver_signatures')
    .select(`
      id, signed_at, signature_name, ip_address,
      player:profiles!waiver_signatures_user_id_fkey(full_name, email),
      waiver:waivers!waiver_signatures_waiver_id_fkey(title, version),
      league:leagues!waiver_signatures_league_id_fkey(name)
    `)
    .eq('organization_id', org.id)
    .order('signed_at', { ascending: false })

  const rows = (signatures ?? []) as Array<{
    id: string
    signed_at: string
    signature_name: string
    ip_address: string | null
    player: { full_name: string; email: string } | { full_name: string; email: string }[] | null
    waiver: { title: string; version: number } | { title: string; version: number }[] | null
    league: { name: string } | { name: string }[] | null
  }>

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
              {rows.map((sig) => {
                const player = Array.isArray(sig.player) ? sig.player[0] : sig.player
                const waiver = Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver
                const league = Array.isArray(sig.league) ? sig.league[0] : sig.league
                return (
                  <tr key={sig.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{player?.full_name ?? '—'}</div>
                      <div className="text-xs text-gray-400">{player?.email ?? '—'}</div>
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
                      {new Date(sig.signed_at).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      <br />
                      {new Date(sig.signed_at).toLocaleTimeString('en-CA', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/settings/waivers/signatures/${sig.id}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        View →
                      </Link>
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
