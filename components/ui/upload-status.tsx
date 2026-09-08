'use client'

import { useEffect, useState } from 'react'

// ── Upload feedback ───────────────────────────────────────────────────────────
// One indicator for every upload in the app. Uploads go through server actions
// (no byte-level progress from the browser), so this is honest about what it
// knows: it's working, for how long, and when that's become suspicious.
//   < 8s   spinner + "Uploading receipt.pdf · 2.4 MB…"
//   ≥ 8s   reassurance (large files on gym wifi take a moment)
//   ≥ 30s  amber "taking longer than expected" with a recovery hint
// role=status + aria-live so screen readers hear the state change too.

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin shrink-0`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SLOW_MS = 8_000
const STUCK_MS = 30_000

export function UploadStatus({
  active,
  label = 'Uploading',
  file,
  className = '',
}: {
  active: boolean
  /** Verb phrase, e.g. "Uploading receipt" / "Importing schedule". */
  label?: string
  /** The file in flight, when known — adds name + size so the user knows what's happening. */
  file?: { name?: string | null; size?: number | null } | null
  className?: string
}) {
  // Mount a fresh timer per upload: the inner component only exists while
  // active, so elapsed time starts at zero without a reset-in-effect.
  if (!active) return null
  return <ActiveUploadStatus label={label} file={file} className={className} />
}

function ActiveUploadStatus({ label, file, className }: {
  label: string
  file?: { name?: string | null; size?: number | null } | null
  className: string
}) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [])

  const stuck = elapsedMs >= STUCK_MS
  const slow = elapsedMs >= SLOW_MS && !stuck
  const seconds = Math.floor(elapsedMs / 1000)
  const detail = [file?.name, file?.size ? formatBytes(file.size) : null].filter(Boolean).join(' · ')

  return (
    <div role="status" aria-live="polite" className={`text-xs ${className}`}>
      <div className={`flex items-center gap-2 ${stuck ? 'text-amber-700' : 'text-gray-600'}`}>
        <Spinner />
        <span className="truncate">
          {label}
          {detail ? ` ${detail}` : ''}…
          {seconds >= 3 && <span className="ml-1 tabular-nums text-gray-400">{seconds}s</span>}
        </span>
      </div>
      {slow && (
        <p className="mt-1 text-gray-500">Still working — large files take a moment on slow wifi.</p>
      )}
      {stuck && (
        <p className="mt-1 text-amber-700">
          This is taking longer than expected. Check your connection; if it doesn&apos;t finish, reload the page and try again.
        </p>
      )}
    </div>
  )
}
