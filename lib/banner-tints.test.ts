import { describe, it, expect } from 'vitest'
import { BANNER_TINTS, assignBannerTints, bannerTint } from './banner-tints'

describe('bannerTint', () => {
  it('uses the team colour when it is a valid hex', () => {
    expect(bannerTint('Thunder', '2026', '#ff8800')).toBe('#ff8800')
    expect(bannerTint('Thunder', '2026', '#fa0')).toBe('#fa0')
  })

  it('falls back to a palette tint keyed to team + year', () => {
    const t = bannerTint('Thunder', '2026', null)
    expect(BANNER_TINTS).toContain(t)
    expect(bannerTint('Thunder', '2026', 'not-a-colour')).toBe(t)
    expect(bannerTint('thunder', '2026')).toBe(t) // case-insensitive key
  })
})

describe('assignBannerTints', () => {
  it('never puts two fallback banners of the same tint side by side', () => {
    // Same team, consecutive years hash to whatever they hash to; force a clash
    // by repeating one banner and check the neighbour steps on.
    const b = { teamName: 'Spikers', year: '2024' }
    const tints = assignBannerTints([b, b, b])
    expect(tints[0]).not.toBe(tints[1])
    expect(tints[1]).not.toBe(tints[2])
  })

  it('keeps team colours as-is even when neighbours match', () => {
    const tints = assignBannerTints([
      { teamName: 'A', year: '2024', color: '#123456' },
      { teamName: 'B', year: '2025', color: '#123456' },
    ])
    expect(tints).toEqual(['#123456', '#123456'])
  })

  it('a fallback next to a team colour of the same value steps away from it', () => {
    const tints = assignBannerTints([
      { teamName: 'A', year: '2024', color: '#24406e' },
      { teamName: 'B', year: '2025' },
    ])
    expect(tints[1]).not.toBe('#24406e')
  })
})
