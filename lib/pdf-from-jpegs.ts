// A minimal PDF writer: one JPEG per page, scaled to fit a US Letter page.
// Used to "print" from an iPhone home-screen app, where window.print() does
// nothing — the page is rasterised, wrapped in a PDF and handed to the share
// sheet (Print, Save to Files, Mail…). JPEG goes in as-is (DCTDecode), so no
// PDF library is needed.

export interface JpegPage {
  /** Raw JPEG bytes. */
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
}

const LETTER = { width: 612, height: 792 } // points (8.5 × 11 in)

export function pdfFromJpegs(pages: JpegPage[], page: { width: number; height: number } = LETTER): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const startObj = (n: number) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
  }

  // Objects: 1 catalog, 2 pages, then per page: page, image, content.
  const pageObj = (i: number) => 3 + i * 3
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  startObj(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObj(2)
  push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`)

  pages.forEach((p, i) => {
    const pn = pageObj(i)
    // Fit to the page width, top-aligned; never taller than the page.
    const scale = Math.min(page.width / p.width, page.height / p.height)
    const w = +(p.width * scale).toFixed(2)
    const h = +(p.height * scale).toFixed(2)
    const y = +(page.height - h).toFixed(2)
    const content = `q ${w} 0 0 ${h} 0 ${y} cm /Im0 Do Q`

    startObj(pn)
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${pn + 1} 0 R >> >> /Contents ${pn + 2} 0 R >>\nendobj\n`)
    startObj(pn + 1)
    push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
    push(p.jpeg)
    push('\nendstream\nendobj\n')
    startObj(pn + 2)
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`)
  })

  const objectCount = 2 + pages.length * 3
  const xrefAt = length
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`)
  for (let n = 1; n <= objectCount; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}
