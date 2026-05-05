import { Suspense } from 'react'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { SignaturesFilterBar } from './signatures-filter-bar'

interface Props {
  searchParams: Promise<{ q?: string; event?: string; waiver?: string }>
}

export default async function WaiverSignaturesPage({ searchParams }: Props) {
  const [headersList, { q = '', event: eventFilter = '', waiver: waiverFilter = '' }] =
    await Promise.all([headers(), searchParams])

  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { data: branding } = await db
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Query from waiver_signatures (one row per unique signing event) and join
  // backwards to registrations → leagues so we can list which events each
  // signature covers. This avoids the duplicate-date problem that arises when
  // querying from registrations: because waiver_signatures has UNIQUE(user_id,
  // waiver_id), one signature is shared across every event that uses the same
  // waiver, so a registrations-based query repeats the same signed_at for each
  // registration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sigs } = await (db as any)
    .from('waiver_signatures')
    .select(`
      id, signed_at, signature_name, ip_address, guardian_relationship,
      player:profiles!waiver_signatures_user_id_fkey(full_name, email),
      waiver:waivers!waiver_signatures_waiver_id_fkey(title, version),
      registrations!registrations_waiver_signature_id_fkey(
        league:leagues!registrations_league_id_fkey(name)
      )
    `)
    .eq('organization_id', org.id)
    .order('signed_at', { ascending: false })

  type RawSig = {
    id: string
    signed_at: string
    signature_name: string
    ip_address: string | null
    guardian_relationship: string | null
    player: { full_name: string; email: string } | { full_name: string; email: string }[] | null
    waiver: { title: string; version: number } | { title: string; version: number }[] | null
    registrations: { league: { name: string } | { name: string }[] | null }[] | null
  }

  type NormalisedRow = {
    sigId: string
    playerName: string
    playerEmail: string
    eventNames: string[]   // one signature may cover multiple events
    waiverTitle: string
    waiverVersion: number | null
    signedAt: string
    signatureName: string
    ipAddress: string | null
    guardianRelationship: string | null
  }

  const allRows: NormalisedRow[] = ((sigs ?? []) as RawSig[]).map((sig) => {
    const player = Array.isArray(sig.player) ? sig.player[0] : sig.player
    const waiver = Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver

    // Collect all distinct event names linked to this signature
    const eventNames = (sig.registrations ?? [])
      .map((r) => {
        const l = Array.isArray(r.league) ? r.league[0] : r.league
        return l?.name ?? ''
      })
      .filter(Boolean)
      .sort()

    return {
      sigId: sig.id,
      playerName: player?.full_name ?? '',
      playerEmail: player?.email ?? '',
      eventNames,
      waiverTitle: waiver?.title ?? '',
      waiverVersion: waiver?.version ?? null,
      signedAt: sig.signed_at,
      signatureName: sig.signature_name,
      ipAddress: sig.ip_address,
      guardianRelationship: sig.guardian_relationship,
    }
  })

  // Unique options for dropdowns (sorted)
  const uniqueEvents = [...new Set(allRows.flatMap((r) => r.eventNames))].sort()
  const uniqueWaivers = [...new Set(allRows.map((r) => r.waiverTitle).filter(Boolean))].sort()

  // Apply filters
  const qLower = q.toLowerCase()
  const filteredRows = allRows.filter((r) => {
    if (eventFilter && !r.eventNames.includes(eventFilter)) return false
    if (waiverFilter && r.waiverTitle !== waiverFilter) return false
    if (qLower) {
      const haystack = [r.playerName, r.playerEmail, r.signatureName].join(' ').toLowerCase()
      if (!haystack.includes(qLower)) return false
    }
    return true
  })

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/admin/settings/waivers" className="text-sm text-gray-400 hover:text-gray-600">
          ← Waivers
        </Link>
        <h1 className="text-2xl font-bold mt-1">Signed Waivers</h1>
        <p className="text-sm text-gray-500 mt-1">
          {allRows.length} signature{allRows.length !== 1 ? 's' : ''} on record
        </p>
      </div>

      <Suspense>
        <SignaturesFilterBar
          events={uniqueEvents}
          waivers={uniqueWaivers}
          currentQ={q}
          currentEvent={eventFilter}
          currentWaiver={waiverFilter}
          total={allRows.length}
          filtered={filteredRows.length}
        />
      </Suspense>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">Event(s)</th>
                <th className="px-4 py-3 font-medium text-gray-500">Waiver</th>
                <th className="px-4 py-3 font-medium text-gray-500">Signed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isGuardian = !!row.guardianRelationship
                const guardianLabel = row.guardianRelationship === 'legal_guardian' ? 'Legal guardian' : 'Parent'
                return (
                  <tr key={row.sigId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{row.playerName || '—'}</span>
                        {isGuardian && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            👤 Minor
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{row.playerEmail || '—'}</div>
                      {isGuardian && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Signed by {row.signatureName} ({guardianLabel})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.eventNames.length === 0 ? (
                        <span className="text-gray-400 text-sm">—</span>
                      ) : row.eventNames.length === 1 ? (
                        <span className="text-sm text-gray-700">{row.eventNames[0]}</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {row.eventNames.map((name) => (
                            <span key={name} className="text-xs text-gray-700">{name}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{row.waiverTitle || '—'}</div>
                      {row.waiverVersion && (
                        <div className="text-xs text-gray-400">v{row.waiverVersion}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(row.signedAt).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        timeZone: timezone,
                      })}
                      <br />
                      {new Date(row.signedAt).toLocaleTimeString('en-CA', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: timezone,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/settings/waivers/signatures/${row.sigId}/print`}
                          target="_blank"
                          className="text-xs text-gray-400 hover:text-gray-600"
                          title="Print / Save as PDF"
                        >
                          🖨
                        </Link>
                        <Link
                          href={`/admin/settings/waivers/signatures/${row.sigId}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          View →
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    {allRows.length === 0 ? 'No signed waivers yet.' : 'No results match your filters.'}
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
