import { describe, expect, it } from 'vitest'
import { scoreScanTarget, scoreScanPath } from './score-scan'

describe('scoreScanTarget', () => {
  const game = { publicPath: '/games/g1' }
  it('sends each role to the right screen, on the game day', () => {
    expect(scoreScanTarget('admin', 'g1', '2026-11-21', game)).toBe('/admin/courtside?date=2026-11-21&game=g1')
    expect(scoreScanTarget('scorekeeper', 'g1', '2026-11-21', game)).toBe('/scorekeeping?date=2026-11-21&game=g1')
    expect(scoreScanTarget(null, 'g1', '2026-11-21', game)).toBe('/games/g1')
  })
  it('sends an unscheduled playoff match to the bracket page for organisers', () => {
    const match = { publicPath: '/events/fall-cup', bracketAdminPath: '/admin/events/l1/bracket' }
    expect(scoreScanTarget('admin', 'm1', null, match)).toBe('/admin/events/l1/bracket')
    expect(scoreScanTarget('admin', 'm1', '2026-11-21', match)).toBe('/admin/courtside?date=2026-11-21&game=m1')
    expect(scoreScanTarget('scorekeeper', 'm1', null, match)).toBe('/scorekeeping')
    expect(scoreScanTarget(null, 'm1', null, match)).toBe('/events/fall-cup')
  })
  it('prints a short path', () => {
    expect(scoreScanPath('g1')).toBe('/score/g1')
  })
})
