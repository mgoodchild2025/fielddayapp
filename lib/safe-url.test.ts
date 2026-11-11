import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safe-url'

describe('safeHttpUrl', () => {
  it('keeps web addresses', () => {
    expect(safeHttpUrl('https://instagram.com/kaboom')).toBe('https://instagram.com/kaboom')
    expect(safeHttpUrl('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1#c')
    expect(safeHttpUrl('  https://example.com  ')).toBe('https://example.com/')
  })

  it('adds https:// to an address typed without a scheme', () => {
    expect(safeHttpUrl('instagram.com/kaboom')).toBe('https://instagram.com/kaboom')
    expect(safeHttpUrl('www.youtube.com/@kaboom')).toBe('https://www.youtube.com/@kaboom')
  })

  it('refuses anything that is not http(s)', () => {
    for (const bad of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'mailto:a@b.co', 'ftp://example.com',
    ]) expect(safeHttpUrl(bad), bad).toBeNull()
  })

  it('refuses things that are not addresses', () => {
    for (const bad of [null, undefined, '', '   ', '@kaboom', 'kaboom', 'https://', 'https://user:pw@example.com', 'two words.com', 'x'.repeat(2001)]) {
      expect(safeHttpUrl(bad as string | null), String(bad)).toBeNull()
    }
  })
})
