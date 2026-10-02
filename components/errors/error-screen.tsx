'use client'

import { startTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Shared error screen for every error.tsx boundary. Friendly copy and a way
 * out — never the raw error message (it can be a stack-ish server string);
 * the digest is shown as a reference code an organizer can pass on.
 *
 * Stale-client failure — a tab loaded before a deploy posts an old server-
 * action id ("Server Action <hash> was not found on the server"). A refresh
 * always fixes it, so we do that automatically once (sessionStorage-guarded
 * against loops) and only show the screen if the error survives the reload.
 */

function isStaleClientError(message: string): boolean {
  return /was not found on the server|failed to find server action/i.test(message)
}

export function ErrorScreen({
  error,
  reset,
  homeHref = '/',
  homeLabel = 'Go home',
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  homeLabel?: string
}) {
  const router = useRouter()
  const stale = isStaleClientError(error.message ?? '')

  useEffect(() => {
    if (!stale) return
    const key = 'fd-stale-reloaded'
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      }
    } catch {}
  }, [stale])

  // Server-component errors need fresh server data, not just a re-render.
  const retry = () => startTransition(() => { router.refresh(); reset() })

  return (
    <main className="min-h-[60dvh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center text-2xl" aria-hidden="true">
          {stale ? '↻' : '⚠︎'}
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {stale ? 'This page is out of date' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {stale
            ? 'The app was updated while this page was open. Refreshing loads the new version — anything you typed may need re-entering.'
            : 'This page hit a problem on our end. Trying again usually fixes it.'}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={stale ? () => window.location.reload() : retry}
            className="press min-h-11 px-5 rounded-lg bg-brand-primary text-on-brand text-sm font-semibold"
          >
            {stale ? 'Refresh' : 'Try again'}
          </button>
          <Link
            href={homeHref}
            className="press min-h-11 px-5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 inline-flex items-center justify-center hover:bg-gray-50"
          >
            {homeLabel}
          </Link>
        </div>
        {error.digest && !stale && (
          <p className="mt-6 text-xs text-gray-500">
            If it keeps happening, tell the organizer: reference <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  )
}
