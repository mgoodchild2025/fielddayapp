import { describe, expect, it } from 'vitest'
import { bioPhotoMayReplaceAvatar, isBioPhotoUrl } from './avatar-fallback'

const base = 'https://x.supabase.co/storage/v1/object/public/player-avatars'
const uid = '11111111-1111-4111-8111-111111111111'

describe('bioPhotoMayReplaceAvatar', () => {
  it('fills an empty profile photo', () => {
    expect(bioPhotoMayReplaceAvatar(null, uid)).toBe(true)
    expect(bioPhotoMayReplaceAvatar('  ', uid)).toBe(true)
  })
  it('follows an earlier copy of the bio photo', () => {
    expect(bioPhotoMayReplaceAvatar(`${base}/${uid}/bio.webp?v=123`, uid)).toBe(true)
  })
  it('never replaces a photo the player chose as their profile photo', () => {
    expect(bioPhotoMayReplaceAvatar(`${base}/${uid}/avatar.webp?t=1`, uid)).toBe(false)
    expect(bioPhotoMayReplaceAvatar('https://lh3.googleusercontent.com/a/photo', uid)).toBe(false)
  })
  it("another player's bio photo is not theirs", () => {
    expect(isBioPhotoUrl(`${base}/22222222-2222-4222-8222-222222222222/bio.webp`, uid)).toBe(false)
    expect(isBioPhotoUrl('not a url', uid)).toBe(false)
  })
})
