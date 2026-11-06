'use client'

import { pdfFromJpegs, type JpegPage } from '@/lib/pdf-from-jpegs'

// ── Printing from an iPhone home-screen app ──────────────────────────────────
// iOS ignores window.print() inside a home-screen web app (and in the in-app
// browser a target=_blank link opens there). So on iOS standalone the page is
// rasterised into a Letter-size PDF and handed to the share sheet, which has
// Print and Save to Files. Everywhere else: the normal print dialog.

export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return ios && standalone
}

/**
 * Where to start a new page: forced breaks, else the last row/block edge that
 * fits. `margin` is kept clear at each page's top and bottom (page 1's top
 * margin is the area's own padding).
 */
function pageRanges(root: HTMLElement, pageHeight: number, margin: number): [number, number][] {
  const top = root.getBoundingClientRect().top
  const total = root.scrollHeight
  const forced: number[] = []
  const soft: number[] = []
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    const bottom = r.bottom - top
    // Forced breaks count even on an empty spacer div.
    const style = getComputedStyle(el)
    if (style.breakAfter === 'page' || style.pageBreakAfter === 'always') forced.push(bottom)
    // [data-keep-with-next]: a row that must stay with the one after it (a game's two team rows).
    if (r.height > 0 && el.matches('tr, li, h1, h2, h3, h4, p, section, header, table, [data-print-block]') && !el.matches('[data-keep-with-next]')) soft.push(bottom)
  })
  soft.sort((a, b) => a - b)
  forced.sort((a, b) => a - b)

  const ranges: [number, number][] = []
  let start = 0
  while (start < total - 1) {
    const room = pageHeight - (ranges.length === 0 ? margin : 2 * margin)
    const limit = start + room
    const hard = forced.find((y) => y > start + 1 && y <= limit)
    let end: number
    if (hard !== undefined) end = hard
    else if (limit >= total) end = total
    else {
      // Last block edge in the lower half of the page; else cut at the limit.
      const fit = soft.filter((y) => y > start + room / 2 && y <= limit)
      end = fit.length ? fit[fit.length - 1] : limit
    }
    ranges.push([start, end])
    start = end
  }
  return ranges
}

// iOS refuses canvases past ~16.7M pixels; stay under it.
const MAX_CANVAS_PIXELS = 16_000_000

async function renderPdf(root: HTMLElement, margin: number): Promise<Uint8Array> {
  const { toCanvas } = await import('html-to-image')
  const width = root.offsetWidth
  const total = Math.ceil(root.scrollHeight)
  const pageHeight = Math.round(width * (11 / 8.5))
  // One render of the whole area (each render clones the DOM with inline
  // styles — doing it per page was slow on long schedules), at 2× when it
  // fits under the iOS canvas limit, scaled down when it doesn't.
  const ratio = Math.min(2, Math.sqrt(MAX_CANVAS_PIXELS / (width * total)))
  const full = await toCanvas(root, {
    pixelRatio: ratio,
    backgroundColor: '#ffffff',
    width,
    height: total,
    // Buttons and other print-hidden chrome stay out of the PDF.
    filter: (node) => !(node instanceof HTMLElement && (node.classList.contains('print:hidden') || node.classList.contains('print-hidden'))),
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  })

  const pages: JpegPage[] = []
  for (const [start, end] of pageRanges(root, pageHeight, margin)) {
    const top = start === 0 ? 0 : Math.round(margin * ratio)
    const page = document.createElement('canvas')
    page.width = Math.round(width * ratio)
    const slice = Math.max(1, Math.round((end - start) * ratio))
    page.height = top + slice
    const ctx = page.getContext('2d')
    if (!ctx) throw new Error('Could not render the page.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, page.width, page.height)
    ctx.drawImage(full, 0, Math.round(start * ratio), page.width, slice, 0, top, page.width, slice)
    const blob = await new Promise<Blob | null>((r) => page.toBlob(r, 'image/jpeg', 0.92))
    if (!blob) throw new Error('Could not render the page.')
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: page.width, height: page.height })
  }
  return pdfFromJpegs(pages)
}

// A Letter page is 8.5in; CSS lays out at 96px to the inch.
const LETTER_WIDTH_PX = 816
const PAGE_MARGIN_PX = 48 // 0.5in, the print pages' margin

/**
 * The area to rasterise, laid out at Letter width. Print pages that follow the
 * screen (.print-page-wrapper) are only as wide as the phone, and a 390px-wide
 * layout stretched across a Letter page printed everything at twice its size.
 * So a copy is laid out off-screen at the page width with the print dialog's
 * 0.5in margins and without print-hidden chrome; [data-print-root] areas are
 * already built at real page size and render as they are.
 */
function atPageWidth(area: HTMLElement): { root: HTMLElement; margin: number; done: () => void } {
  if (area.hasAttribute('data-print-root') || !area.parentElement) return { root: area, margin: 0, done: () => {} }
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  // Beside the original, so it inherits the same fonts and brand variables.
  host.style.cssText = `position:fixed;top:0;left:-10000px;width:${LETTER_WIDTH_PX}px;background:#fff;pointer-events:none`
  const copy = area.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.print\\:hidden, .print-hidden').forEach((el) => el.remove())
  Object.assign(copy.style, { width: '100%', maxWidth: 'none', margin: '0', padding: `${PAGE_MARGIN_PX}px`, boxSizing: 'border-box' })
  host.appendChild(copy)
  area.parentElement.appendChild(host)
  return { root: copy, margin: PAGE_MARGIN_PX, done: () => host.remove() }
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap'

/** The printable area as a PDF file (iPhone home-screen app path). */
export async function makePdf(title: string, root?: HTMLElement | null): Promise<File> {
  const area = root
    ?? document.querySelector<HTMLElement>('[data-print-root]')
    ?? document.querySelector<HTMLElement>('.print-page-wrapper')
    ?? document.querySelector<HTMLElement>('main')
  if (!area) throw new Error('Nothing to print.')
  const { root: laidOut, margin, done } = atPageWidth(area)
  let pdf: Uint8Array
  try {
    pdf = await renderPdf(laidOut, margin)
  } finally {
    done()
  }
  const safeName = title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Fieldday'
  return new File([pdf.buffer as ArrayBuffer], `${safeName}.pdf`, { type: 'application/pdf' })
}

/**
 * Open the share sheet (Print, Save to Files…) for a PDF. iOS only allows it
 * straight after a tap: when rendering took long enough for that to lapse it
 * returns 'needs-tap' and the caller asks for one more tap.
 */
export async function sharePdf(file: File, title: string): Promise<ShareOutcome> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      if (e instanceof DOMException && e.name === 'NotAllowedError') return 'needs-tap'
      throw e
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
