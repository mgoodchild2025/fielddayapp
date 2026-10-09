import { describe, expect, it } from 'vitest'
import { cardGaps, describeGaps, displayShowsBios, isCardDone } from './player-card-gaps'

describe('cardGaps', () => {
  it('lists what is missing in nudge order', () => {
    expect(cardGaps({})).toEqual(['number', 'position', 'photo'])
    expect(cardGaps({ jerseyNumber: '7', photoUrl: 'https://x/y.webp' })).toEqual(['position'])
  })

  it('treats blank strings as missing', () => {
    expect(cardGaps({ jerseyNumber: '  ', position: '', photoUrl: null })).toEqual(['number', 'position', 'photo'])
  })

  it('a number of 0 / 00 counts', () => {
    expect(cardGaps({ jerseyNumber: '00', position: 'Libero', photoUrl: 'p' })).toEqual([])
    expect(isCardDone({ jerseyNumber: '0', position: 'Setter', photoUrl: 'p' })).toBe(true)
  })
})

describe('describeGaps', () => {
  it('reads naturally', () => {
    expect(describeGaps([])).toBe('')
    expect(describeGaps(['photo'])).toBe('a photo')
    expect(describeGaps(['number', 'photo'])).toBe('your number and a photo')
    expect(describeGaps(['number', 'position', 'photo'])).toBe('your number, your position and a photo')
  })
})

describe('displayShowsBios', () => {
  it('only showcase zones with bios count', () => {
    expect(displayShowsBios({ zones: [{ type: 'showcase', source: 'bios' }] })).toBe(true)
    expect(displayShowsBios({ zones: [{ type: 'schedule' }, { type: 'showcase', source: 'both' }] })).toBe(true)
    expect(displayShowsBios({ zones: [{ type: 'showcase', source: 'photos' }] })).toBe(false)
    expect(displayShowsBios({ zones: [{ type: 'showcase', source: 'banners' }] })).toBe(false)
    expect(displayShowsBios(null)).toBe(false)
    expect(displayShowsBios({ zones: 'nope' })).toBe(false)
  })
})
