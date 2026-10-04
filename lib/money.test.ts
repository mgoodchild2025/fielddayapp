import { describe, expect, it } from 'vitest'
import { formatDollars } from './money'

describe('formatDollars', () => {
  it('keeps whole dollars clean', () => {
    expect(formatDollars(7500)).toBe('$75')
    expect(formatDollars(0)).toBe('$0')
  })
  it('never rounds cents away', () => {
    expect(formatDollars(7250)).toBe('$72.50')
    expect(formatDollars(1999)).toBe('$19.99')
    expect(formatDollars(5)).toBe('$0.05')
  })
})
