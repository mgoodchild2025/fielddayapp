import { describe, expect, it } from 'vitest'
import { outcomeFor, winStreak, resultAlert, setLine, cardHeadline, streakLabel, isFreshResult, nightStillPlaying, nightAlert, orgNight } from './game-result'

describe('outcomeFor / winStreak', () => {
  it('reads each side', () => {
    expect(outcomeFor(21, 18)).toBe('W')
    expect(outcomeFor(18, 21)).toBe('L')
    expect(outcomeFor(2, 2)).toBe('T')
  })
  it('counts trailing wins only', () => {
    expect(winStreak(['W', 'L', 'W', 'W', 'W'])).toBe(3)
    expect(winStreak(['W', 'W', 'L'])).toBe(0)
    expect(winStreak([])).toBe(0)
  })
})

describe('resultAlert', () => {
  it('celebrates a win, and a streak from 2', () => {
    expect(resultAlert({ outcome: 'W', myScore: 21, theirScore: 18, opponent: 'Net Results', streak: 1 }))
      .toEqual({ title: 'W 21–18 vs Net Results 🎉', body: 'Nice win! Tap for your result card.' })
    expect(resultAlert({ outcome: 'W', myScore: 2, theirScore: 0, opponent: 'Dig Deep', streak: 3, sets: [{ my: 25, their: 20 }, { my: 25, their: 18 }] }).body)
      .toBe("That's 3 wins in a row 🔥 Sets (25–20, 25–18). Tap for your result card.")
  })
  it('keeps a loss warm, never rubbing it in', () => {
    const a = resultAlert({ outcome: 'L', myScore: 18, theirScore: 21, opponent: 'Net Results', streak: 0 })
    expect(a.title).toBe('18–21 vs Net Results')
    expect(a.body).toBe('Good battle. On to the next one 💪')
  })
  it('ties', () => {
    expect(resultAlert({ outcome: 'T', myScore: 20, theirScore: 20, opponent: 'X', streak: 0 }).title).toBe('Tie 20–20 vs X')
  })
})

describe('card pieces', () => {
  it('words', () => {
    expect(setLine(null)).toBeNull()
    expect(cardHeadline('W')).toBe('WIN')
    expect(cardHeadline('L')).toBe('FINAL')
    expect(streakLabel(1)).toBeNull()
    expect(streakLabel(4)).toBe('4 WINS IN A ROW')
  })
})

describe('isFreshResult', () => {
  const now = Date.parse('2026-11-28T20:00:00Z')
  it('games from the last 3 days alert; older catch-up entries do not', () => {
    expect(isFreshResult('2026-11-28T19:00:00Z', now)).toBe(true)
    expect(isFreshResult('2026-11-26T19:00:00Z', now)).toBe(true)
    expect(isFreshResult('2026-11-20T19:00:00Z', now)).toBe(false)
    expect(isFreshResult(null, now)).toBe(false)
  })
  it('a game far in the future (a mistyped date) does not either', () => {
    expect(isFreshResult('2026-12-05T19:00:00Z', now)).toBe(false)
  })
})

describe('one alert per night', () => {
  it('waits while anything today is unfinished', () => {
    expect(nightStillPlaying([{ done: true }, { done: false }])).toBe(true)
    expect(nightStillPlaying([{ done: true }, { done: true }])).toBe(false)
  })
  it('a winning night lists every result', () => {
    const a = nightAlert([
      { outcome: 'W', my: 21, their: 18, opponent: 'Net Results' },
      { outcome: 'L', my: 15, their: 21, opponent: 'Dig Deep' },
      { outcome: 'W', my: null, their: null, opponent: 'Spikers' },
    ], 1)
    expect(a.title).toBe('2–1 tonight 🎉')
    expect(a.body).toBe('W 21–18 vs Net Results · L 15–21 vs Dig Deep · W vs Spikers.')
  })
  it('a streak, a split night and a tough night', () => {
    expect(nightAlert([{ outcome: 'W', my: 2, their: 0, opponent: 'A' }, { outcome: 'W', my: 2, their: 1, opponent: 'B' }], 4).body)
      .toBe("W 2–0 vs A · W 2–1 vs B. That's 4 wins in a row 🔥")
    const split = nightAlert([{ outcome: 'W', my: 21, their: 10, opponent: 'A' }, { outcome: 'L', my: 9, their: 21, opponent: 'B' }], 0)
    expect(split.title).toBe('1–1 tonight')
    expect(split.body.endsWith('Good night out 💪')).toBe(true)
    expect(nightAlert([{ outcome: 'L', my: 1, their: 2, opponent: 'A' }, { outcome: 'T', my: 20, their: 20, opponent: 'B' }], 0))
      .toEqual({ title: '0–1–1 tonight', body: 'L 1–2 vs A · Tie 20–20 vs B. Good battles. On to the next one 💪' })
  })
  it('the night is the org calendar date', () => {
    expect(orgNight('2026-11-29T02:30:00Z', 'America/Toronto')).toBe('2026-11-28')
  })
})
