/**
 * Simple in-process rate limiter.
 *
 * Uses a Map keyed by an identifier (e.g. IP address) where each entry holds
 * a sliding window of request timestamps. Works per serverless instance, so
 * it is not a perfect global counter, but it significantly raises the cost of
 * abuse and is zero-dependency.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 10 })
 *   const { limited } = limiter.check(ip)
 *   if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

interface RateLimiterOptions {
  /** Rolling window length in milliseconds */
  windowMs: number
  /** Maximum number of requests allowed within the window */
  max: number
}

interface RateLimiter {
  check(key: string): { limited: boolean; remaining: number; resetAt: number }
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): RateLimiter {
  // Map<key, timestamp[]>  — timestamps of requests within the current window
  const store = new Map<string, number[]>()

  // Periodically prune keys that have had no recent activity to prevent memory growth.
  // Only runs if the module stays warm (long-lived instances); harmless on cold starts.
  const pruneInterval = Math.max(windowMs * 2, 60_000)
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      const now = Date.now()
      for (const [key, timestamps] of store) {
        const recent = timestamps.filter((t) => now - t < windowMs)
        if (recent.length === 0) store.delete(key)
        else store.set(key, recent)
      }
    }, pruneInterval).unref?.()
  }

  return {
    check(key: string) {
      const now = Date.now()
      const windowStart = now - windowMs

      // Get existing timestamps, drop anything outside the window
      const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart)

      if (timestamps.length >= max) {
        // Earliest timestamp tells us when the window resets
        const resetAt = (timestamps[0] ?? now) + windowMs
        return { limited: true, remaining: 0, resetAt }
      }

      timestamps.push(now)
      store.set(key, timestamps)

      return { limited: false, remaining: max - timestamps.length, resetAt: now + windowMs }
    },
  }
}

/**
 * Extract the best available client IP from a Next.js request.
 * Falls back to a fixed string so the limiter still works behind proxies
 * that strip headers (prevents silent bypass).
 */
export function getClientIp(request: Request): string {
  const forwarded = (request as { headers: Headers }).headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return (request as { headers: Headers }).headers.get('x-real-ip') ?? 'unknown'
}
