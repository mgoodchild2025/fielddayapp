import { apiError, buildApiError } from '@/lib/api-error'

// Catch-all for unmatched /api/* paths.
//
// Without this, Next.js answers an unknown API path with the HTML 404 page —
// unparseable for an agent or any non-browser client. Every defined route is
// more specific than this catch-all, so real endpoints are unaffected; only
// paths that match nothing land here.

export const dynamic = 'force-dynamic'

function notFound(pathname: string): Response {
  return apiError('not_found', `No API endpoint matches ${pathname}.`, {
    details: { path: pathname },
  })
}

function handler(request: Request): Response {
  return notFound(new URL(request.url).pathname)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler

// HEAD must not carry a body — mirror the status and headers only.
export function HEAD(request: Request): Response {
  const { status } = buildApiError('not_found', `No API endpoint matches ${new URL(request.url).pathname}.`)
  return new Response(null, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { Allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS', 'Cache-Control': 'no-store' },
  })
}
