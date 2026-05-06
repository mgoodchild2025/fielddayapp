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
 * On any sharp error the caller should fall back to the original bytes.
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

  const webpBuffer = await sharp(buf)
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()

  return { buffer: webpBuffer, contentType: 'image/webp' }
}
