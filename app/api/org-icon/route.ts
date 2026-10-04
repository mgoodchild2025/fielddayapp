import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import sharp from 'sharp'
import { getOrgBrandingCached, cached } from '@/lib/org-cache'
import { ICON_SIZES, logoFill, type IconSize } from '@/lib/app-icon'

/**
 * The org's logo as a square PNG app icon (home screen / install).
 *
 * Logos are stored as WebP of any shape, but iOS wants a PNG apple-touch-icon
 * and Android wants fixed-size PNGs plus a "maskable" one it can crop — without
 * these, installs fell back to a page screenshot (iOS) or the Fieldday icon
 * (Android). The logo is centred on white with padding; maskable keeps it in
 * the central safe zone.
 */
export async function GET(request: Request) {
  const orgId = (await headers()).get('x-org-id')
  const params = new URL(request.url).searchParams
  const size = Number(params.get('size')) as IconSize
  const maskable = params.get('maskable') === '1'
  const fallback = NextResponse.redirect(new URL('/Fieldday-Icon.png', request.url))

  if (!orgId || !ICON_SIZES.includes(size)) return fallback
  const branding = await getOrgBrandingCached(orgId)
  const logoUrl = branding?.logo_url
  if (!logoUrl) return fallback

  try {
    // Key ends in the org id, so a branding save (invalidateOrgCache) drops it.
    const png = await cached(`icon:${size}:${maskable ? 'm' : 'a'}:${logoUrl}:${orgId}`, 6 * 60 * 60 * 1000, async () => {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
      if (!res.ok) throw new Error(`logo ${res.status}`)
      const inner = Math.round(size * logoFill(maskable))
      const logo = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer()
      return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
        .composite([{ input: logo, gravity: 'centre' }])
        .png()
        .toBuffer()
    })
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // The URL carries the logo version (?v=), so it can be cached hard.
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[org-icon] render failed:', err)
    return fallback
  }
}
