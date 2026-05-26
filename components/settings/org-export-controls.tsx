'use client'

import { useState, useEffect, useCallback } from 'react'

interface ExportJob {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'expired'
  archive_size_bytes: number | null
  error_message: string | null
  requested_at: string
  completed_at: string | null
  expires_at: string | null
  downloaded_at: string | null
}

const POLL_INTERVAL_MS = 3000

export function OrgExportControls() {
  const [job, setJob] = useState<ExportJob | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/export/org-data/status')
      if (res.ok) {
        const { job: j } = await res.json()
        setJob(j)
      }
    } catch {
      // ignore polling errors
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll while in-progress
  useEffect(() => {
    if (!job) return
    if (job.status !== 'pending' && job.status !== 'processing') return

    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [job, fetchStatus])

  async function handleRequestExport() {
    setRequesting(true)
    setRequestError(null)
    try {
      const res = await fetch('/api/export/org-data/request', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setRequestError(body.error ?? 'Request failed')
        setRequesting(false)
        return
      }
      setShowConfirm(false)
      setAcknowledged(false)
      // Start polling
      await fetchStatus()
    } catch {
      setRequestError('Network error. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const isInProgress = job?.status === 'pending' || job?.status === 'processing'
  const isReady = job?.status === 'ready'
  const isFailed = job?.status === 'failed'
  const isExpired = job?.status === 'expired'

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 mb-0.5">Export all data</h2>
          <p className="text-sm text-gray-500 mb-4">
            Download a complete archive of your organization&apos;s data — leagues, teams, players,
            games, scores, waivers, and financial records — as a ZIP file with CSV and JSON files.
            You&apos;ll receive an email when the export is ready.
          </p>

          {/* Current job status */}
          {!loadingStatus && (isInProgress || isReady || isFailed || isExpired) && (
            <div className={`rounded-lg border px-4 py-3 mb-4 text-sm ${
              isReady ? 'bg-green-50 border-green-200' :
              isFailed ? 'bg-red-50 border-red-200' :
              isExpired ? 'bg-gray-50 border-gray-200' :
              'bg-blue-50 border-blue-200'
            }`}>
              {isInProgress && (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-blue-700 font-medium">
                    {job?.status === 'pending' ? 'Export queued…' : 'Preparing your export…'}
                  </span>
                  <span className="text-blue-500 text-xs">Checking every {POLL_INTERVAL_MS / 1000}s</span>
                </div>
              )}

              {isReady && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-green-700 font-medium">Export ready</span>
                      {job?.archive_size_bytes && (
                        <span className="text-green-600 text-xs">({formatBytes(job.archive_size_bytes)})</span>
                      )}
                    </div>
                    <a
                      href={`/api/export/org-data/download/${job?.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download ZIP
                    </a>
                  </div>
                  {job?.expires_at && (
                    <p className="text-green-600 text-xs mt-1.5">
                      Available until {new Date(job.expires_at).toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                      {job.downloaded_at && ` · Last downloaded ${new Date(job.downloaded_at).toLocaleDateString('en-CA', { dateStyle: 'short' })}`}
                    </p>
                  )}
                </div>
              )}

              {isFailed && (
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="text-red-700 font-medium">Export failed</span>
                    {job?.error_message && (
                      <p className="text-red-500 text-xs mt-0.5">{job.error_message}</p>
                    )}
                    <p className="text-red-500 text-xs mt-0.5">You can request a new export below.</p>
                  </div>
                </div>
              )}

              {isExpired && (
                <div className="flex items-center gap-2 text-gray-500">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm">
                    Previous export expired on {job?.expires_at ? new Date(job.expires_at).toLocaleDateString('en-CA', { dateStyle: 'medium' }) : '—'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Request button — hidden while in progress */}
          {!isInProgress && (
            <>
              {!showConfirm ? (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isReady ? 'Request new export' : 'Export all data'}
                </button>
              ) : (
                <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Before you export</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    This archive will contain personal information about your players, including names,
                    email addresses, and phone numbers. By downloading it you acknowledge that:
                  </p>
                  <ul className="text-xs text-gray-500 list-disc list-inside space-y-1 leading-relaxed">
                    <li>Your organization is responsible for this data under PIPEDA</li>
                    <li>You must handle the archive in accordance with your privacy obligations to players</li>
                    <li>The archive should be stored securely and deleted when no longer needed</li>
                    <li>Sharing it with third parties may require player consent</li>
                  </ul>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={e => setAcknowledged(e.target.checked)}
                      className="mt-0.5 rounded"
                    />
                    <span className="text-xs text-gray-700">
                      I understand and accept responsibility for handling this data appropriately
                    </span>
                  </label>

                  {requestError && (
                    <p className="text-sm text-red-500">{requestError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleRequestExport}
                      disabled={!acknowledged || requesting}
                      className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {requesting ? 'Starting export…' : 'Start export'}
                    </button>
                    <button
                      onClick={() => { setShowConfirm(false); setAcknowledged(false); setRequestError(null) }}
                      className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="mt-3 text-xs text-gray-400">
            You&apos;ll receive an email when the export is ready. Archives are available for 7 days. Maximum 3 exports per 24 hours.
          </p>
        </div>
      </div>
    </div>
  )
}
