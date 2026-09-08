/**
 * The public origin of a request behind Railway's proxy. `request.url` there
 * is the container address (https://0.0.0.0:8080), so any absolute redirect
 * built from it is unreachable. Prefer x-forwarded-host (org subdomain or
 * custom domain), then host, ignoring container/loopback addresses.
 */
export function publicOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const fwdHost = request.headers.get('x-forwarded-host')
  if (fwdHost && !isInternal(fwdHost)) return `${proto}://${fwdHost}`
  const host = request.headers.get('host')
  if (host && !isInternal(host)) return `${host.startsWith('localhost') ? 'http' : proto}://${host}`
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://fielddayapp.ca'
}

function isInternal(host: string): boolean {
  return host.startsWith('0.0.0.0') || host.startsWith('127.') || host.startsWith('[::')
}
