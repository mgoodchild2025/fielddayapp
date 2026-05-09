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

  // Two parallel queries:
  // 1. Registered players — from registrations joined to waiver_signatures
  // 2. Guests — directly from waiver_signatures where user_id IS NULL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const [{ data: regs }, { data: guestSigs }] = await Promise.all([
    // ── Registered players ──────────────────────────────────────────────────
    anyDb
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
      .order('created_at', { ascending: false }),

    // ── Guest signers (no account, no registration) ─────────────────────────
    anyDb
      .from('waiver_signatures')
      .select(`
        id, signed_at, signature_name, ip_address, guardian_relationship,
        guest_name, guest_email,
        league:leagues!waiver_signatures_league_id_fkey(name),
        waiver:waivers!waiver_signatures_waiver_id_fkey(title, version)
      `)
      .eq('organization_id', org.id)
      .is('user_id', null)
      .order('signed_at', { ascending: false }),
  ])

  type NormalisedRow = {
    id: string
    playerName: string
    playerEmail: string
    eventName: string
    waiverTitle: string
    waiverVersion: number | null
    sigId: string | null
    signedAt: string | null
    signatureName: string | null
    ipAddress: string | null
    guardianRelationship: string | null
    isGuest: boolean
  }

  // Normalise registered-player rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registeredRows: NormalisedRow[] = ((regs ?? []) as any[]).map((reg) => {
    const player = Array.isArray(reg.player) ? reg.player[0] : reg.player
    const league = Array.isArray(reg.league) ? reg.league[0] : reg.league
    const sig = Array.isArray(reg.signature) ? reg.signature[0] : reg.signature
    const waiver = sig ? (Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver) : null
    return {
      id: reg.id,
      playerName: player?.full_name ?? '',
      playerEmail: player?.email ?? '',
      eventName: league?.name ?? '',
      waiverTitle: waiver?.title ?? '',
      waiverVersion: waiver?.version ?? null,
      sigId: sig?.id ?? null,
      signedAt: sig?.signed_at ?? null,
      signatureName: sig?.signature_name ?? null,
      ipAddress: sig?.ip_address ?? null,
      guardianRelationship: sig?.guardian_relationship ?? null,
      isGuest: false,
    }
  })

  // Normalise guest rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guestRows: NormalisedRow[] = ((guestSigs ?? []) as any[]).map((sig) => {
    const league = Array.isArray(sig.league) ? sig.league[0] : sig.league
    const waiver = Array.isArray(sig.waiver) ? sig.waiver[0] : sig.waiver
    return {
      id: sig.id,
      playerName: sig.guest_name ?? '',
      playerEmail: sig.guest_email ?? '',
      eventName: league?.name ?? '',
      waiverTitle: waiver?.title ?? '',
      waiverVersion: waiver?.version ?? null,
      sigId: sig.id,
      signedAt: sig.signed_at ?? null,
      signatureName: sig.signature_name ?? null,
      ipAddress: sig.ip_address ?? null,
      guardianRelationship: sig.guardian_relationship ?? null,
      isGuest: true,
    }
  })

  // Merge and sort by signed_at descending (registered rows already ordered by registration date;
  // we re-sort the merged list by signature date for a coherent view).
  const allRows = [...registeredRows, ...guestRows].sort((a, b) => {
    const ta = a.signedAt ? new Date(a.signedAt).getTime() : 0
    const tb = b.signedAt ? new Date(b.signedAt).getTime() : 0
    return tb - ta
  })

  // Unique options for dropdowns (sorted)
  const uniqueEvents = [...new Set(allRows.map((r) => r.eventName).filter(Boolean))].sort()
  const uniqueWaivers = [...new Set(allRows.map((r) => r.waiverTitle).filter(Boolean))].sort()

  // Apply filters
  const qLower = q.toLowerCase()
  const filteredRows = allRows.filter((r) => {
    if (eventFilter && r.eventName !== eventFilter) return false
    if (waiverFilter && r.waiverTitle !== waiverFilter) return false
    if (qLower) {
      const haystack = [r.playerName, r.playerEmail, r.signatureName ?? ''].join(' ').toLowerCase()
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
                <th className="px-4 py-3 font-medium text-gray-500">Event</th>
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
                  <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{row.playerName || '—'}</span>
                        {row.isGuest && (
                          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            Guest
                          </span>
                        )}
                        {isGuardian && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            👤 Minor
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{row.playerEmail || '—'}</div>
                      {isGuardian && row.signatureName && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Signed by {row.signatureName} ({guardianLabel})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.eventName || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{row.waiverTitle || '—'}</div>
                      {row.waiverVersion && (
                        <div className="text-xs text-gray-400">v{row.waiverVersion}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {row.signedAt ? (
                        <>
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
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.sigId && (
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
                      )}
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
