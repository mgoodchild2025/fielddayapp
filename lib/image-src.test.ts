import { describe, expect, it } from 'vitest'
import { canOptimizeImage } from './image-src'

describe('canOptimizeImage', () => {
  it('optimises Supabase storage images', () => {
    expect(canOptimizeImage('https://abc.supabase.co/storage/v1/object/public/org-branding/o/logo.webp')).toBe(true)
  })
  it('leaves other hosts alone (next/image would throw on them)', () => {
    expect(canOptimizeImage('https://res.cloudinary.com/x/image/upload/a.jpg')).toBe(false)
    expect(canOptimizeImage('https://evil.com/x.supabase.co.png')).toBe(false)
    expect(canOptimizeImage('https://supabase.co.evil.com/a.png')).toBe(false)
  })
  it('never rasterises SVGs', () => {
    expect(canOptimizeImage('https://abc.supabase.co/storage/v1/object/public/b/logo.SVG')).toBe(false)
  })
  it('ignores empty, relative, data and http URLs', () => {
    for (const s of [null, undefined, '', '/logo.png', 'data:image/png;base64,AAA', 'http://abc.supabase.co/a.png']) {
      expect(canOptimizeImage(s)).toBe(false)
    }
  })
})
