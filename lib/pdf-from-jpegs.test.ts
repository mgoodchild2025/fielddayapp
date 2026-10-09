import { describe, expect, it } from 'vitest'
import { pdfFromJpegs } from './pdf-from-jpegs'

const fakeJpeg = (n: number) => new Uint8Array([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 251), 0xff, 0xd9])
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('pdfFromJpegs', () => {
  const pdf = pdfFromJpegs([
    { jpeg: fakeJpeg(40), width: 1700, height: 2200 },
    { jpeg: fakeJpeg(10), width: 1700, height: 900 },
  ])
  const s = text(pdf)

  it('is a PDF with one page object per image', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Count 2')
    expect(s.match(/\/Type \/Page /g)).toHaveLength(2)
    expect(s.match(/\/Filter \/DCTDecode/g)).toHaveLength(2)
  })

  it('xref offsets point at their objects', () => {
    const xref = s.slice(s.indexOf('xref\n'))
    const entries = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(entries).toHaveLength(8) // catalog, pages, 2 × (page, image, content)
    entries.forEach((offset, i) => expect(s.slice(offset, offset + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
    const startxref = Number(s.match(/startxref\n(\d+)/)![1])
    expect(s.slice(startxref, startxref + 4)).toBe('xref')
  })

  it('fits each image to the page width, top-aligned', () => {
    // 1700×2200 at 612 wide → 792 tall (fills the page); 1700×900 → 324 tall at the top.
    expect(s).toContain('q 612 0 0 792 0 0 cm /Im0 Do Q')
    expect(s).toContain('q 612 0 0 324 0 468 cm /Im0 Do Q')
  })

  it('embeds the JPEG bytes untouched', () => {
    const jpeg = fakeJpeg(40)
    const at = pdf.findIndex((b, i) => b === 0xff && pdf[i + 1] === 0xd8)
    expect(Array.from(pdf.slice(at, at + jpeg.length))).toEqual(Array.from(jpeg))
  })
})
