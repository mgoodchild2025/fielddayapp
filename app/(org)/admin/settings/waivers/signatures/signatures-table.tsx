'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export type SignatureRow = {
  id: string
  playerName: string
  playerEmail: string
  eventName: string
  teamName: string | null
  waiverTitle: string
  waiverVersion: number | null
  sigId: string
  signedAt: string | null
  signatureName: string | null
  guardianRelationship: string | null
  isGuest: boolean
}

const PAGE_SIZE = 25

export function SignaturesTable({
  rows,
  timezone,
  totalOnRecord,
  // A key that changes when filters/sort change, so we reset pagination
  resetKey,
}: {
  rows: SignatureRow[]
  timezone: string
  totalOnRecord: number
  resetKey: string
}) {
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever the filtered/sorted result set changes
  useEffect(() => { setPage(1) }, [resetKey])

  const visibleRows = rows.slice(0, page * PAGE_SIZE)
  const hasMore = visibleRows.length < rows.length

  return (
    <>
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
              {visibleRows.map((row) => {
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
                      {row.teamName && (
                        <div className="text-xs text-gray-500 mt-0.5">🏅 {row.teamName}</div>
                      )}
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    {totalOnRecord === 0 ? 'No signed waivers yet.' : 'No results match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Load more ({rows.length - visibleRows.length} remaining)
          </button>
        </div>
      )}
      {rows.length > PAGE_SIZE && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Showing {visibleRows.length} of {rows.length}
        </p>
      )}
    </>
  )
}
