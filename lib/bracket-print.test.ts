import { describe, expect, it } from 'vitest'
import { tierColor, stageColor, stageShort, slotHint } from './bracket-print'

describe('tierColor', () => {
  it('reads medal names and falls back by position', () => {
    expect(tierColor('Gold')).toBe('#a16207')
    expect(tierColor('Championship')).toBe('#a16207')
    expect(tierColor('Silver Bracket')).toBe('#475569')
    expect(tierColor('Bronze')).toBe('#9a3412')
    expect(tierColor('Division A', 0)).not.toBe(tierColor('Division B', 1))
  })
})

describe('stageColor', () => {
  it('gives each stage its own colour', () => {
    const final = stageColor(1), third = stageColor(1, 2), semis = stageColor(2), qf = stageColor(4), r16 = stageColor(8)
    expect(new Set([final, third, semis, qf, r16]).size).toBe(5)
    expect(stageColor(200)).toBe(final)
    expect(stageColor(101)).not.toBe(qf)
  })
})

describe('slotHint', () => {
  it('names the seed or the scaffold label', () => {
    expect(slotHint({ seed: 3, label: null, feed: null })).toBe('Seed 3')
    expect(slotHint({ seed: 1, label: 'Pool winner #1', feed: null })).toBe('Pool winner #1')
    expect(slotHint({ seed: 2, label: 'TBD', feed: null })).toBe('Seed 2')
  })
  it('names where a later-round team comes from', () => {
    expect(slotHint({ seed: null, label: null, feed: { outcome: 'winner', stage: 'Quarter-Finals', matchNumber: 2 } }))
      .toBe('Winner of QF Match 2')
    expect(slotHint({ seed: null, label: null, feed: { outcome: 'loser', stage: 'Quarter-Finals', matchNumber: 1, bracketName: 'Gold' } }))
      .toBe('Loser of Gold QF Match 1')
  })
  it('prefers the scaffold label over the route, so drop-down slots say it once', () => {
    expect(slotHint({ seed: null, label: 'Loser of Gold Quarter-Finals M2', feed: { outcome: 'loser', stage: 'Quarter-Finals', matchNumber: 2, bracketName: 'Gold' } }))
      .toBe('Loser of Gold Quarter-Finals M2')
  })
  it('is null with nothing to say', () => {
    expect(slotHint({ seed: null, label: null, feed: null })).toBeNull()
    expect(stageShort('Semi-Finals')).toBe('SF')
    expect(stageShort('Final')).toBe('Final')
  })
})
