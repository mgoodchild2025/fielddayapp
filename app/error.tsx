'use client'

import { useEffect } from 'react'

/**
 * Root error boundary. One case gets special handling: the stale-client
 * failure — a tab loaded before a deploy posts an old server-action id and
 * gets "Server Action <hash> was not found on the server". A refresh always
 * fixes it (the reload fetches the new build), so we do that automatically
 * once (sessionStorage-guarded against loops) and only show UI if the error
 * survives the reload.
 */

function isStaleClientError(message: string): boolean {
  return /was not found on the server|failed to find server action/i.test(message)
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const stale = isStaleClientError(error.message ?? '')

  useEffect(() => {
    if (!stale) return
    // Reload once per session for this failure; if it recurs after a fresh
    // load, something else is wrong — the visible UI below stays available.
    const key = 'fd-stale-reloaded'
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.reload()
    }
  }, [stale])

  if (stale) {
    return (
      <html>
        <body>
          <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>This page is out of date</h1>
            <p style={{ color: '#666', marginBottom: 24 }}>
              The app was updated while this page was open. Refreshing gets the new version — anything you typed on
              this page may need re-entering.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            >
              Refresh
            </button>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html>
      <body>
        <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#666', marginBottom: 24 }}>{error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={reset}
            style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
