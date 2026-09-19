// Structured JSON errors for every API route.
//
// Agents (and any non-browser client) cannot parse an HTML error page. Each
// error carries a stable machine-readable `code`, a human `message`, and a
// `hint` telling the caller what to do about it — so a failed call is
// actionable without scraping markup.

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable'

/** HTTP status for each code — the one mapping, so routes can't disagree. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
}

/** Default resolution hint per code. A route may override with its own. */
const DEFAULT_HINTS: Record<ApiErrorCode, string> = {
  bad_request: 'Check the request parameters and body against the documented shape, then retry.',
  unauthorized: 'Sign in and send the session cookie with the request.',
  forbidden: 'This account lacks permission for this resource. Contact an organization admin for access.',
  not_found: 'Check the URL path and any identifiers in it. See https://fielddayapp.ca/sitemap.xml for public pages.',
  method_not_allowed: 'Use one of the HTTP methods this endpoint supports.',
  rate_limited: 'Wait before retrying. Back off exponentially and honour the Retry-After header when present.',
  internal_error: 'This is a fault on our side. Retry shortly; if it persists, contact support@fielddayapp.ca.',
  service_unavailable: 'The service is temporarily unavailable. Retry after a short delay.',
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    hint: string
    status: number
    /** Optional machine-readable specifics, e.g. which field failed validation. */
    details?: Record<string, unknown>
    /** Where a human or agent can get help. */
    documentation: string
  }
}

export interface ApiErrorOptions {
  hint?: string
  details?: Record<string, unknown>
}

const DOCUMENTATION_URL = 'https://fielddayapp.ca/contact'

/**
 * Pure builder — returns the status and JSON body for an API error.
 * Kept separate from the Response so it can be unit tested directly.
 */
export function buildApiError(
  code: ApiErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): { status: number; body: ApiErrorBody } {
  const status = API_ERROR_STATUS[code]
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      hint: options.hint ?? DEFAULT_HINTS[code],
      status,
      documentation: DOCUMENTATION_URL,
    },
  }
  if (options.details) body.error.details = options.details
  return { status, body }
}

/** The same error as a JSON Response, with no-store so agents never cache a failure. */
export function apiError(
  code: ApiErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): Response {
  const { status, body } = buildApiError(code, message, options)
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
