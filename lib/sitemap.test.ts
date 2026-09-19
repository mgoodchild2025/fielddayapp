import { describe, it, expect } from 'vitest'
import { buildSitemapXml, toLastmod, xmlEscape } from './sitemap'

describe('toLastmod', () => {
  it('reduces a timestamp to a W3C date', () => {
    expect(toLastmod('2026-09-15T20:32:31.000Z')).toBe('2026-09-15')
    expect(toLastmod(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02')
  })

  it('passes a plain date through unchanged', () => {
    expect(toLastmod('2026-03-04')).toBe('2026-03-04')
  })

  it('returns null rather than inventing a date', () => {
    expect(toLastmod(null)).toBeNull()
    expect(toLastmod(undefined)).toBeNull()
    expect(toLastmod('')).toBeNull()
    expect(toLastmod('not a date')).toBeNull()
  })
})

describe('xmlEscape', () => {
  it('escapes the five XML entities', () => {
    expect(xmlEscape(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })
})

describe('buildSitemapXml', () => {
  it('emits a valid urlset with the declaration and namespace', () => {
    const xml = buildSitemapXml([{ loc: 'https://fielddayapp.ca/' }])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('includes lastmod when known and omits the tag when not', () => {
    const xml = buildSitemapXml([
      { loc: 'https://fielddayapp.ca/a', lastmod: '2026-09-15T10:00:00Z' },
      { loc: 'https://fielddayapp.ca/b' },
      { loc: 'https://fielddayapp.ca/c', lastmod: null },
    ])
    expect(xml).toContain('<loc>https://fielddayapp.ca/a</loc><lastmod>2026-09-15</lastmod>')
    expect(xml).toContain('<url><loc>https://fielddayapp.ca/b</loc></url>')
    expect(xml).toContain('<url><loc>https://fielddayapp.ca/c</loc></url>')
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
  })

  it('escapes query strings in URLs', () => {
    const xml = buildSitemapXml([{ loc: 'https://fielddayapp.ca/s?a=1&b=2' }])
    expect(xml).toContain('<loc>https://fielddayapp.ca/s?a=1&amp;b=2</loc>')
    expect(xml).not.toContain('a=1&b=2')
  })

  it('produces one url element per entry', () => {
    const xml = buildSitemapXml([
      { loc: 'https://fielddayapp.ca/1' },
      { loc: 'https://fielddayapp.ca/2' },
      { loc: 'https://fielddayapp.ca/3' },
    ])
    expect(xml.match(/<url>/g)).toHaveLength(3)
  })

  it('handles an empty list without emitting a broken document', () => {
    const xml = buildSitemapXml([])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('<url>')
  })
})
