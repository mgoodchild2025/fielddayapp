import { describe, it, expect } from 'vitest'
import { cloudinaryThumb, isCloudinaryUrl } from './cloudinary-url'

const BASE = 'https://res.cloudinary.com/demo/image/upload/v1712345678/fieldday/org/events/league/photo.jpg'

describe('isCloudinaryUrl', () => {
  it('recognises image and video delivery URLs', () => {
    expect(isCloudinaryUrl(BASE)).toBe(true)
    expect(isCloudinaryUrl('https://res.cloudinary.com/demo/video/upload/v1/a.mp4')).toBe(true)
  })

  it('rejects everything else, including Supabase storage', () => {
    expect(isCloudinaryUrl('https://abc.supabase.co/storage/v1/object/public/a.png')).toBe(false)
    expect(isCloudinaryUrl('/local.png')).toBe(false)
    expect(isCloudinaryUrl('')).toBe(false)
  })
})

describe('cloudinaryThumb', () => {
  it('inserts the transform straight after /upload/', () => {
    const out = cloudinaryThumb(BASE, { width: 400, height: 400 })
    expect(out).toBe('https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,q_auto,f_auto/v1712345678/fieldday/org/events/league/photo.jpg')
  })

  it('always asks Cloudinary to pick quality and format', () => {
    const out = cloudinaryThumb(BASE, { width: 200 })
    expect(out).toContain('q_auto')
    expect(out).toContain('f_auto')
  })

  it('omits height when only a width is given', () => {
    expect(cloudinaryThumb(BASE, { width: 200 })).toContain('/upload/w_200,c_fill,q_auto,f_auto/')
  })

  it('honours the fit crop mode', () => {
    expect(cloudinaryThumb(BASE, { width: 200, crop: 'fit' })).toContain('c_fit')
  })

  it('is idempotent — applying it twice does not stack transforms', () => {
    const once = cloudinaryThumb(BASE, { width: 400, height: 400 })
    const twice = cloudinaryThumb(once, { width: 400, height: 400 })
    expect(twice).toBe(once)
    expect(twice.match(/w_400/g)).toHaveLength(1)
  })

  it('replaces an existing transform rather than appending to it', () => {
    const preset = 'https://res.cloudinary.com/demo/image/upload/w_1600,c_limit/v1/a.jpg'
    const out = cloudinaryThumb(preset, { width: 300 })
    expect(out).not.toContain('w_1600')
    expect(out).toContain('w_300')
  })

  it('leaves a non-Cloudinary URL untouched', () => {
    const supa = 'https://abc.supabase.co/storage/v1/object/public/photo.png'
    expect(cloudinaryThumb(supa, { width: 400 })).toBe(supa)
  })

  it('returns an empty string for null or undefined rather than throwing', () => {
    expect(cloudinaryThumb(null, { width: 400 })).toBe('')
    expect(cloudinaryThumb(undefined, { width: 400 })).toBe('')
  })

  it('rounds fractional sizes, since Cloudinary needs integers', () => {
    expect(cloudinaryThumb(BASE, { width: 199.6 })).toContain('w_200')
  })
})
