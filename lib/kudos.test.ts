import { describe, expect, it } from 'vitest'
import { isKudosKind, kudosOpen, summarizeKudos, kudosAlert } from './kudos'

describe('kudos', () => {
  it('only the fixed kinds', () => {
    expect(isKudosKind('hustle')).toBe(true)
    expect(isKudosKind('<b>rude</b>')).toBe(false)
  })
  it('open from the start of the game for 3 days, never for cancelled games', () => {
    const at = '2026-11-25T23:00:00Z'
    const t = Date.parse(at)
    expect(kudosOpen(at, 'scheduled', t - 60_000)).toBe(false)
    expect(kudosOpen(at, 'completed', t + 60_000)).toBe(true)
    expect(kudosOpen(at, 'scheduled', t + 4 * 86_400_000)).toBe(false)
    expect(kudosOpen(at, 'cancelled', t + 60_000)).toBe(false)
  })
  it('summarises most first', () => {
    expect(summarizeKudos(['hustle', 'good_sport', 'hustle', 'great_play']).map((k) => `${k.emoji}${k.count}`))
      .toEqual(['🏃2', '💥1', '🤝1'])
  })
  it('alert wording', () => {
    expect(kudosAlert('Sam L.', 'clutch', true)).toEqual({ title: 'Sam L. gave you kudos: 🧊 Clutch', body: 'From the other team. That is some respect 👏' })
  })
})
