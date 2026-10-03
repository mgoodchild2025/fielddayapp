import { describe, expect, it } from 'vitest'
import { keepSubsets, googleFontsUrl } from './google-fonts'

const face = (subset: string, family = 'X') =>
  `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  src: url(https://fonts.gstatic.com/${subset}.woff2) format('woff2');\n}\n`

describe('keepSubsets', () => {
  it('keeps latin + latin-ext, drops the rest', () => {
    const css = face('cyrillic') + face('vietnamese') + face('latin-ext') + face('latin')
    const out = keepSubsets(css)
    expect(out).toContain('latin-ext.woff2')
    expect(out).toContain('/latin.woff2')
    expect(out).not.toContain('cyrillic')
    expect(out).not.toContain('vietnamese')
    expect(out.match(/@font-face/g)).toHaveLength(2)
  })

  it('keeps unlabelled faces', () => {
    expect(keepSubsets(`@font-face { font-family: 'Y'; }`)).toContain(`'Y'`)
  })

  it('can never close the <style> it is inlined in', () => {
    expect(keepSubsets(`/* latin */ @font-face { font-family: '</style><script>'; }`)).not.toContain('<')
  })
})

describe('googleFontsUrl', () => {
  it('encodes admin-entered names', () => {
    expect(googleFontsUrl('Big Shoulders Display', 'A&B')).toContain('family=Big%20Shoulders%20Display:wght@400;600;700&family=A%26B:')
  })
})
