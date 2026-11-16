import { describe, expect, it } from 'vitest'
import { tvVideoUrl, videoSlideSeconds, MAX_VIDEO_SLIDE_S } from './tv-media'

describe('tvVideoUrl', () => {
  it('asks Cloudinary for a 1280px MP4', () => {
    expect(tvVideoUrl('https://res.cloudinary.com/acme/video/upload/v1700000000/fieldday/o/events/l/abc.mov'))
      .toBe('https://res.cloudinary.com/acme/video/upload/q_auto,w_1280,c_limit/v1700000000/fieldday/o/events/l/abc.mp4')
    expect(tvVideoUrl('https://res.cloudinary.com/acme/video/upload/clip'))
      .toBe('https://res.cloudinary.com/acme/video/upload/q_auto,w_1280,c_limit/clip.mp4')
  })
  it('leaves anything else alone', () => {
    expect(tvVideoUrl('https://example.com/v.mov')).toBe('https://example.com/v.mov')
    expect(tvVideoUrl('https://res.cloudinary.com/acme/image/upload/a.jpg')).toBe('https://res.cloudinary.com/acme/image/upload/a.jpg')
  })
})

describe('videoSlideSeconds', () => {
  it('plays the video through, a beat over, capped', () => {
    expect(videoSlideSeconds(12.3)).toBe(14)
    expect(videoSlideSeconds(2)).toBe(4)
    expect(videoSlideSeconds(300)).toBe(MAX_VIDEO_SLIDE_S)
    expect(videoSlideSeconds(null)).toBe(21)
    expect(videoSlideSeconds(Number.NaN)).toBe(21)
  })
})
