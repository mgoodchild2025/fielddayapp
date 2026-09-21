import { describe, it, expect } from 'vitest'
import { sanitizeRichText, isSafeLinkHref, isSafeImageSrc } from './sanitize-html'

describe('sanitizeRichText', () => {
  it('keeps the formatting the editor actually produces', () => {
    const html = '<p>Bring <strong>indoor</strong> shoes and a <em>light</em> jersey.</p><ul><li>7:30 start</li></ul>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it('removes script tags', () => {
    const out = sanitizeRichText('<p>Rules</p><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('<p>Rules</p>')
  })

  it('removes inline event handlers', () => {
    const out = sanitizeRichText('<p onclick="steal()">Tap</p>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('Tap')
  })

  it('strips a javascript: link but keeps the link text', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">Waiver</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('Waiver')
  })

  it('strips a data: source that is not a raster image', () => {
    const out = sanitizeRichText('<img src="data:text/html;base64,PHNjcmlwdD4=">')
    expect(out).not.toContain('data:text/html')
  })

  it('strips an inline SVG data source, which can carry script', () => {
    const out = sanitizeRichText('<img src="data:image/svg+xml;base64,PHN2Zz4=">')
    expect(out).not.toContain('data:image/svg')
  })

  it('keeps a raster data image, which the editor inserts mid-upload', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
    expect(sanitizeRichText(`<img src="${src}">`)).toContain(src)
  })

  it('keeps ordinary links and images intact', () => {
    const out = sanitizeRichText('<a href="https://fielddayapp.ca">Site</a><img src="https://cdn.example.com/a.png" alt="Team">')
    expect(out).toContain('href="https://fielddayapp.ca"')
    expect(out).toContain('src="https://cdn.example.com/a.png"')
    expect(out).toContain('alt="Team"')
  })

  it('keeps mailto and tel links, which leagues use for contacts', () => {
    const out = sanitizeRichText('<a href="mailto:a@b.ca">Email</a><a href="tel:+15551234567">Call</a>')
    expect(out).toContain('mailto:a@b.ca')
    expect(out).toContain('tel:+15551234567')
  })

  it('drops iframes and objects', () => {
    const out = sanitizeRichText('<iframe src="https://evil.example"></iframe><object data="x"></object>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichText('')).toBe('')
  })
})

describe('isSafeLinkHref', () => {
  it('accepts the schemes a league would use', () => {
    expect(isSafeLinkHref('https://fielddayapp.ca')).toBe(true)
    expect(isSafeLinkHref('http://example.com')).toBe(true)
    expect(isSafeLinkHref('mailto:hello@fielddayapp.ca')).toBe(true)
    expect(isSafeLinkHref('tel:+15551234567')).toBe(true)
  })

  it('accepts relative and fragment links, which carry no scheme', () => {
    expect(isSafeLinkHref('/schedule')).toBe(true)
    expect(isSafeLinkHref('#rules')).toBe(true)
  })

  it('rejects javascript and data URLs, including padded and mixed case', () => {
    expect(isSafeLinkHref('javascript:alert(1)')).toBe(false)
    expect(isSafeLinkHref('  JavaScript:alert(1)')).toBe(false)
    expect(isSafeLinkHref('data:text/html,<script>')).toBe(false)
    expect(isSafeLinkHref('vbscript:msgbox')).toBe(false)
  })

  it('rejects an empty or blank URL', () => {
    expect(isSafeLinkHref('')).toBe(false)
    expect(isSafeLinkHref('   ')).toBe(false)
  })
})

describe('isSafeImageSrc', () => {
  it('allows raster data images but not svg or html', () => {
    expect(isSafeImageSrc('data:image/png;base64,AAA')).toBe(true)
    expect(isSafeImageSrc('data:image/webp;base64,AAA')).toBe(true)
    expect(isSafeImageSrc('data:image/svg+xml;base64,AAA')).toBe(false)
    expect(isSafeImageSrc('data:text/html,<script>')).toBe(false)
  })

  it('allows ordinary hosted images and relative paths', () => {
    expect(isSafeImageSrc('https://cdn.example.com/a.png')).toBe(true)
    expect(isSafeImageSrc('/logo.png')).toBe(true)
  })

  it('rejects a javascript source', () => {
    expect(isSafeImageSrc('javascript:alert(1)')).toBe(false)
  })
})
