/**
 * Birthday shout-outs (pure; tested in birthday.test.ts). Players may share a
 * month and day — never a year — on their profile. Feb 29 birthdays are
 * celebrated on Feb 28 in other years.
 */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

export function daysInMonth(month: number): number {
  return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isValidBirthday(month: number, day: number): boolean {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month)
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Is it their birthday on `localDate` (YYYY-MM-DD, the org's calendar day)? */
export function isBirthdayOn(month: number | null | undefined, day: number | null | undefined, localDate: string): boolean {
  if (!month || !day) return false
  const [y, m, d] = localDate.split('-').map(Number)
  if (month === 2 && day === 29 && !isLeap(y)) return m === 2 && d === 28
  return m === month && d === day
}

/** The org's calendar day now, YYYY-MM-DD. */
export function localDateIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "March 14" */
export function formatBirthday(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`
}
