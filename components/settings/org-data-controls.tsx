'use client'

import { useState } from 'react'

interface RetentionLog {
  event_type: 'export' | 'deidentification' | 'deletion'
  triggered_by: 'admin' | 'platform_admin' | 'cron'
  player_count: number | null
  created_at: string
  notes: string | null
}

interface Props {
  orgId: string
  canExport: boolean
  exportWindowStatus: 'open' | 'closed' | 'active_subscription'
  exportWindowEndsAt: string | null
  dataDeidentifiedAt: string | null
  recentLogs: RetentionLog[]
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  export: 'Data exported',
  deidentification: 'Data de-identified',
  deletion: 'Data deleted',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  export: 'bg-blue-50 text-blue-700 border-blue-200',
  deidentification: 'bg-amber-50 text-amber-700 border-amber-200',
  deletion: 'bg-red-50 text-red-700 border-red-200',
}

export function OrgDataControls({
  canExport,
  exportWindowStatus,
  exportWindowEndsAt,
  dataDeidentifiedAt,
  recentLogs,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleExport() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await fetch('/api/export/org-players')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setDownloadError(body.error ?? `Export failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `fieldday-player-data-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Export card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-0.5">Export player data</h2>
            <p className="text-sm text-gray-500 mb-4">
              Download a complete JSON export of all player profiles, registrations, team memberships,
              waiver signatures, payment records, and RSVP history for your organization.
            </p>

            {exportWindowStatus === 'open' && exportWindowEndsAt && (
              <p className="text-xs text-amber-600 mb-3">
                Export available until{' '}
                {new Date(exportWindowEndsAt).toLocaleDateString('en-CA', { dateStyle: 'long' })}.
              </p>
            )}

            {canExport ? (
              <div>
                <button
                  onClick={handleExport}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {downloading ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  {downloading ? 'Preparing export…' : 'Download player data (JSON)'}
                </button>
                {downloadError && (
                  <p className="mt-2 text-sm text-red-500">{downloadError}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  The export includes all data Fieldday holds about your players and is suitable for import into spreadsheet or database tools.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-500">
                  The 30-day export window following your subscription cancellation has passed.
                  Contact <a href="mailto:privacy@fielddayapp.ca" className="underline hover:text-gray-700">privacy@fielddayapp.ca</a> for assistance.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retention policy info card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-0.5">Data retention policy</h2>
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                Fieldday retains player data for the duration of your active subscription plus a
                <strong className="text-gray-700"> 30-day export window</strong> after cancellation.
              </p>
              <p>
                Within <strong className="text-gray-700">60 days</strong> after the export window closes,
                Fieldday will de-identify all personal player data — names, emails, phone numbers,
                and emergency contact information are removed or anonymized.
              </p>
              <p>
                Payment and registration records are retained for <strong className="text-gray-700">7 years</strong> as
                required by Canadian tax law, but are anonymized and no longer linked to any individual.
              </p>
              {dataDeidentifiedAt && (
                <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-green-700 text-xs">
                    Player data for this organization was de-identified on{' '}
                    {new Date(dataDeidentifiedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Audit log */}
      {recentLogs.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Retention activity</h2>
          <div className="space-y-3">
            {recentLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${EVENT_TYPE_COLORS[log.event_type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {EVENT_TYPE_LABELS[log.event_type] ?? log.event_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                    {' · '}
                    {log.triggered_by === 'cron' ? 'Automatic' : log.triggered_by === 'platform_admin' ? 'Fieldday staff' : 'Admin'}
                    {log.player_count != null && ` · ${log.player_count} player${log.player_count !== 1 ? 's' : ''}`}
                  </p>
                  {log.notes && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{log.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
