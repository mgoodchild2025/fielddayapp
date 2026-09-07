import sharp from 'sharp'

export interface WebPOptions {
  /** Maximum width in px. Image is scaled down proportionally if wider. Default 1600. */
  maxWidth?: number
  /** Maximum height in px. Image is scaled down proportionally if taller. Default 1600. */
  maxHeight?: number
  /** WebP quality 1–100. Default 82. */
  quality?: number
}

/**
 * Convert an image buffer to WebP.
 *
 * Returns null (skip conversion) for:
 *  - SVGs — already optimal vector format
 *  - GIFs — may be animated; sharp can't preserve animation reliably
 *
 * Also returns null when sharp fails (corrupt file, unsupported codec such as
 * HEIC bytes mislabelled as JPEG, or a decode that blows the memory budget) —
 * every caller already treats null as "store the original bytes", so a bad
 * conversion degrades to an un-optimised upload instead of a thrown server
 * action that leaves the UI stuck in its uploading state.
 */
export async function convertToWebP(
  input: ArrayBuffer | Buffer,
  mimeType: string,
  options: WebPOptions = {},
): Promise<{ buffer: Buffer; contentType: 'image/webp' } | null> {
  // Types we intentionally leave untouched
  if (mimeType === 'image/svg+xml' || mimeType === 'image/gif') return null

  const { maxWidth = 1600, maxHeight = 1600, quality = 82 } = options
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)

  try {
    const webpBuffer = await sharp(buf)
      .rotate()  // auto-orient from EXIF before stripping metadata
      .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
    return { buffer: webpBuffer, contentType: 'image/webp' }
  } catch (err) {
    console.warn('[image-utils] WebP conversion failed, keeping original bytes:', err)
    return null
  }
}

/**
 * Rotate an image by the given degrees and return as WebP.
 * Degrees must be 90, 180, or 270 (clockwise).
 */
export async function rotateImage(
  input: ArrayBuffer | Buffer,
  degrees: 90 | 180 | 270,
): Promise<{ buffer: Buffer; contentType: 'image/webp' }> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const rotated = await sharp(buf)
    .rotate(degrees)
    .webp({ quality: 82 })
    .toBuffer()
  return { buffer: rotated, contentType: 'image/webp' }
}
