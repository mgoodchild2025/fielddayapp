/**
 * The public origin of a request behind Railway's proxy. `request.url` there
 * is the container address (https://0.0.0.0:8080), so any absolute redirect
 * built from it is unreachable. Prefer x-forwarded-host (org subdomain or
 * custom domain), then host, ignoring container/loopback addresses.
 */
export function publicOrigin(request: Request): string {
  return originFromHeaders(request.headers)
}

/** Same resolution from a Headers-like object (e.g. `await headers()` in a server component). */
export function originFromHeaders(h: { get(name: string): string | null }): string {
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const fwdHost = h.get('x-forwarded-host')
  if (fwdHost && !isInternal(fwdHost)) return `${proto}://${fwdHost}`
  const host = h.get('host')
  if (host && !isInternal(host)) return `${host.startsWith('localhost') ? 'http' : proto}://${host}`
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://fielddayapp.ca'
}

function isInternal(host: string): boolean {
  return host.startsWith('0.0.0.0') || host.startsWith('127.') || host.startsWith('[::')
}
