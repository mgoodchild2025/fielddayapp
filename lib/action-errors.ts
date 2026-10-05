/**
 * What to tell someone when a server action (or fetch) throws instead of
 * returning `{ error }` — on gym wifi that's a dropped request, a 502 during a
 * deploy, or a tab from before a deploy calling an action id that's gone.
 * Pure + tested; client components catch with `actionErrorMessage(err)`.
 */

export const NETWORK_ERROR_MESSAGE = "Couldn't reach the server — check your connection and try again."
export const STALE_PAGE_MESSAGE = 'This page is out of date — reloading…'

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return ''
}

/** A tab from before a deploy calling a server action the new build doesn't have. */
export function isStaleBuildError(err: unknown): boolean {
  const m = messageOf(err)
  return /was not found on the server|failed[- ]to[- ]find[- ]server[- ]action/i.test(m)
    || (err instanceof Error && err.name === 'UnrecognizedActionError')
}

/** Transport failure: offline, dropped, timed out, or a 5xx/HTML response. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = messageOf(err)
  return /failed to fetch|fetch failed|load failed|networkerror|network request failed|network error|the network connection was lost|unexpected response was received from the server|timed? ?out/i.test(m)
}

export function actionErrorMessage(err: unknown): string {
  if (isStaleBuildError(err)) return STALE_PAGE_MESSAGE
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE
  return 'Something went wrong — please try again.'
}

/**
 * Reload once for a stale-build error (the page state worth keeping — e.g.
 * the scoreboard — is in localStorage). Returns true when a reload started.
 */
export function reloadIfStale(err: unknown): boolean {
  if (!isStaleBuildError(err) || typeof window === 'undefined') return false
  try {
    const key = 'fd-action-stale-reload'
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (Date.now() - last < 30_000) return false // don't loop
    sessionStorage.setItem(key, String(Date.now()))
  } catch { /* storage blocked: still reload once */ }
  window.location.reload()
  return true
}

/**
 * Await a server action that reports failure as `{ error }`, turning a THROW
 * (dropped request, 502, stale build) into the same `{ error }` shape — so the
 * caller's existing error path resets its pending state instead of leaving a
 * button stuck on "Submitting…" or hitting the error boundary.
 * Callers already check `error` before reading `data`.
 */
export async function safeAction<T extends { error?: string | null }>(pending: Promise<T>): Promise<T> {
  try {
    return await pending
  } catch (err) {
    reloadIfStale(err)
    return { error: actionErrorMessage(err) } as T
  }
}
