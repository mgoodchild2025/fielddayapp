import { describe, expect, it } from 'vitest'
import { isValidBirthday, isBirthdayOn, localDateIn, formatBirthday } from './birthday'

describe('birthdays', () => {
  it('validates month and day', () => {
    expect(isValidBirthday(2, 29)).toBe(true)
    expect(isValidBirthday(2, 30)).toBe(false)
    expect(isValidBirthday(4, 31)).toBe(false)
    expect(isValidBirthday(13, 1)).toBe(false)
  })
  it('matches the org calendar day; Feb 29 on Feb 28 in other years', () => {
    expect(isBirthdayOn(3, 14, '2026-03-14')).toBe(true)
    expect(isBirthdayOn(3, 14, '2026-03-15')).toBe(false)
    expect(isBirthdayOn(2, 29, '2026-02-28')).toBe(true)
    expect(isBirthdayOn(2, 29, '2028-02-28')).toBe(false)
    expect(isBirthdayOn(2, 29, '2028-02-29')).toBe(true)
    expect(isBirthdayOn(null, 3, '2026-03-03')).toBe(false)
  })
  it('the org day, not UTC', () => {
    expect(localDateIn('America/Toronto', new Date('2026-03-15T02:00:00Z'))).toBe('2026-03-14')
  })
  it('formats', () => {
    expect(formatBirthday(3, 14)).toBe('March 14')
  })
})
