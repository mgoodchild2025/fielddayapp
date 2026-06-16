'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportOrgEventMedia } from '@/actions/event-media'

export function OrgMediaExport() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; imageZipUrl: string | null; videoZipUrl: string | null } | null>(null)

  async function run() {
    setBusy(true); setError(null); setResult(null)
    const res = await exportOrgEventMedia()
    setBusy(false)
    if (res.error || !res.data) { setError(res.error ?? 'Export failed.'); return }

    // Download the manifest CSV (always complete, even if a ZIP is too large).
    const blob = new Blob([res.data.manifestCsv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'event-media-manifest.csv'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)

    setResult({ count: res.data.count, imageZipUrl: res.data.imageZipUrl, videoZipUrl: res.data.videoZipUrl })
  }

  return (
    <div className="bg-white rounded-lg border p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-gray-900">Event media</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Download every uploaded photo and video. You&rsquo;ll get a CSV manifest (events, uploaders, captions, links)
          plus ZIP archives of the files from Cloudinary.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <button
        type="button" onClick={run} disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <Download className="w-4 h-4" />
        {busy ? 'Preparing…' : 'Prepare media export'}
      </button>

      {result && (
        <div className="rounded-md border bg-gray-50 px-3 py-2.5 text-sm space-y-1.5">
          {result.count === 0 ? (
            <p className="text-gray-500">No event media to export yet.</p>
          ) : (
            <>
              <p className="text-gray-700">Manifest downloaded ({result.count} item{result.count !== 1 ? 's' : ''}).</p>
              <div className="flex flex-wrap gap-3">
                {result.imageZipUrl && (
                  <a href={result.imageZipUrl} className="font-medium text-[var(--brand-primary)] hover:underline">Download photos (ZIP) ↗</a>
                )}
                {result.videoZipUrl && (
                  <a href={result.videoZipUrl} className="font-medium text-[var(--brand-primary)] hover:underline">Download videos (ZIP) ↗</a>
                )}
              </div>
              <p className="text-xs text-gray-400">ZIP links are time-limited. The manifest CSV lists every direct file URL as a backup.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
