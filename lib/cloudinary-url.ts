// Cloudinary delivery-URL transforms.
//
// Kept free of the Cloudinary SDK so it can run in client components too —
// this is pure string work on a delivery URL, no credentials involved.
//
// Why it exists: event media stores the raw upload URL as its thumbnail, so a
// grid of ~150px tiles was downloading multi-megabyte phone photos. Applying
// the transform at READ time rather than upload time means every photo already
// in the database benefits, with no backfill.

export interface ThumbOptions {
  width: number
  height?: number
  /** 'fill' crops to the box, 'fit' letterboxes inside it. */
  crop?: 'fill' | 'fit'
}

/** True for a Cloudinary delivery URL we know how to rewrite. */
export function isCloudinaryUrl(url: string): boolean {
  return /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(url)
}

/**
 * Insert a transformation into a Cloudinary delivery URL.
 * Returns the URL unchanged when it is not a Cloudinary upload URL, so callers
 * can apply it blindly to a mixed set of sources.
 *
 * q_auto and f_auto let Cloudinary pick quality and format (WebP/AVIF) per
 * browser, which is where most of the saving comes from.
 */
export function cloudinaryThumb(url: string | null | undefined, opts: ThumbOptions): string {
  if (!url || !isCloudinaryUrl(url)) return url ?? ''

  const parts: string[] = [`w_${Math.round(opts.width)}`]
  if (opts.height) parts.push(`h_${Math.round(opts.height)}`)
  parts.push(`c_${opts.crop ?? 'fill'}`, 'q_auto', 'f_auto')
  const transform = parts.join(',')

  // Split on the first /upload/ and insert ours directly after it. An existing
  // transformation segment (anything before the version) is replaced, so
  // applying this twice is idempotent rather than compounding.
  const [prefix, rest] = url.split(/\/upload\//)
  const withoutExisting = rest.replace(/^(?:[a-z]{1,3}_[^/]+\/)+/, '')
  return `${prefix}/upload/${transform}/${withoutExisting}`
}
