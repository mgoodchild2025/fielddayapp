import { describe, it, expect } from 'vitest'
import {
  parseHex, relativeLuminance, contrastRatio, formatRatio, checkContrast,
  AA_NORMAL_TEXT, AA_NON_TEXT,
} from './contrast'

describe('parseHex', () => {
  it('parses six-digit and three-digit hex, with or without the hash', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseHex('#F00')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('returns null for anything else', () => {
    expect(parseHex('')).toBeNull()
    expect(parseHex('red')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('#gggggg')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('matches the WCAG reference values at both extremes', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })
})

describe('contrastRatio', () => {
  it('gives 21:1 for black on white, the maximum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
  })

  it('gives 1:1 for a colour against itself', () => {
    expect(contrastRatio('#3366cc', '#3366cc')).toBeCloseTo(1, 5)
  })

  it('is symmetric — order of arguments does not matter', () => {
    const a = contrastRatio('#1d6b6b', '#ffffff')!
    const b = contrastRatio('#ffffff', '#1d6b6b')!
    expect(a).toBeCloseTo(b, 10)
  })

  it('matches known reference pairs', () => {
    // #767676 on white is the canonical "exactly passes AA normal text" grey.
    expect(contrastRatio('#767676', '#ffffff')!).toBeGreaterThanOrEqual(4.5)
    // One shade lighter fails.
    expect(contrastRatio('#777777', '#ffffff')!).toBeLessThan(4.54)
  })

  it('returns null when a colour cannot be parsed', () => {
    expect(contrastRatio('nope', '#ffffff')).toBeNull()
    expect(contrastRatio('#ffffff', '')).toBeNull()
  })
})

describe('formatRatio', () => {
  it('truncates rather than rounding up, so a near miss never reads as a pass', () => {
    expect(formatRatio(4.499)).toBe('4.49')
    expect(formatRatio(21)).toBe('21.00')
  })
})

describe('checkContrast', () => {
  it('passes dark text on a white page', () => {
    const r = checkContrast('#111827', '#ffffff', 'Body text on the page background')!
    expect(r.passes).toBe(true)
    expect(r.message).toContain('meets the 4.5:1 minimum')
  })

  it('fails white text on a pale brand colour — the case this exists to catch', () => {
    const r = checkContrast('#ffffff', '#7fd4c1', 'White button text on the primary colour')!
    expect(r.passes).toBe(false)
    expect(r.required).toBe(AA_NORMAL_TEXT)
    expect(r.message).toContain('below the 4.5:1 minimum')
  })

  it('accepts a lower bar for non-text, where WCAG requires only 3:1', () => {
    const r = checkContrast('#6aa8a2', '#ffffff', 'Badge fill', AA_NON_TEXT)!
    expect(r.required).toBe(3)
  })

  it('returns null rather than guessing when a colour is mid-edit', () => {
    expect(checkContrast('#ff', '#ffffff', 'x')).toBeNull()
  })
})
