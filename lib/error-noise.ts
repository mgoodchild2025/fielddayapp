/**
 * Classification of uncaught server errors that are request garbage rather
 * than bugs — pure, so it can be unit-tested without the reporter's Supabase
 * and email dependencies.
 *
 * Background: Next treats any POST whose Content-Type looks like a form as a
 * potential Server Action and calls request.formData() before it knows which
 * page (if any) matched. Vulnerability scanners and misconfigured bots POST
 * `multipart/form-data` with no boundary or a truncated body to random URLs,
 * so undici throws "Failed to parse body as FormData" from the /_not-found
 * route. No real user is affected — a browser never emits a malformed
 * multipart body — so these are logged for volume tracking but never paged.
 */

const BODY_PARSE_PATTERNS: RegExp[] = [
  /^Failed to parse body as FormData/i,
  /^Could not parse content as FormData/i, // older undici wording
  /^Invalid Server Actions request/i,
  /^Unexpected end of (?:form|multipart)/i,
]

export interface NoiseContext {
  routePath?: string
}

/**
 * True when the error is a request-body parse failure on a route that
 * doesn't exist. Both conditions are required: a body-parse error on a real
 * page could still be a genuine bug (e.g. a form we render that sends a bad
 * body), and a not-found hit on its own is ordinary traffic Next handles fine.
 */
export function isBotRequestNoise(message: string, ctx: NoiseContext = {}): boolean {
  const notFoundRoute = ctx.routePath?.includes('/_not-found') ?? false
  if (!notFoundRoute) return false
  return BODY_PARSE_PATTERNS.some((re) => re.test(message))
}

/**
 * The path to record for an error. Next's `routePath` is the matched route
 * (e.g. `/_not-found/page`), which hides the URL actually requested — the
 * one thing you need to tell a scanner from a broken link. Record the real
 * URL first and keep the route in parentheses when the two differ.
 */
export function describeErrorPath(
  requestPath: string | undefined,
  routePath: string | undefined,
): string | null {
  const req = requestPath?.slice(0, 300)
  if (!req) return routePath ?? null
  if (!routePath || routePath === req) return req
  return `${req} (${routePath})`
}
