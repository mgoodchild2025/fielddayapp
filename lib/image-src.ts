/**
 * Whether next/image may optimise this URL (serve a resized WebP/AVIF from
 * /_next/image) instead of the original upload.
 *
 * Uploads are stored up to 800–1600px, but most render as 24–48px avatars and
 * logos — unoptimised, a phone downloads every one at full size. Only hosts in
 * next.config `images.remotePatterns` can be optimised (any other host makes
 * next/image throw, which is why these were all `unoptimized`), and SVGs are
 * never rasterised. Everything else keeps loading the original as before.
 */
export function canOptimizeImage(src: string | null | undefined): boolean {
  if (!src) return false
  try {
    const u = new URL(src)
    return u.protocol === 'https:'
      && u.hostname.endsWith('.supabase.co')
      && !u.pathname.toLowerCase().endsWith('.svg')
  } catch {
    return false // relative / data: / blob: — leave as is
  }
}
