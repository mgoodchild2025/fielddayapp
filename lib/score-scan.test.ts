import { describe, expect, it } from 'vitest'
import { scoreScanTarget, scoreScanPath } from './score-scan'

describe('scoreScanTarget', () => {
  it('sends each role to the right screen, on the game day', () => {
    expect(scoreScanTarget('admin', 'g1', '2026-11-21')).toBe('/admin/courtside?date=2026-11-21&game=g1')
    expect(scoreScanTarget('scorekeeper', 'g1', '2026-11-21')).toBe('/scorekeeping?date=2026-11-21&game=g1')
    expect(scoreScanTarget(null, 'g1', '2026-11-21')).toBe('/games/g1')
  })
  it('prints a short path', () => {
    expect(scoreScanPath('g1')).toBe('/score/g1')
  })
})
