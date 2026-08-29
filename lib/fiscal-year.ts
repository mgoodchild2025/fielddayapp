/**
 * Fiscal year ranges from the org's start month (1 = January = calendar year).
 * Pure date-string math — all values are YYYY-MM-DD.
 */

export type DateRange = { from: string; to: string }

const mm = (m: number) => String(m).padStart(2, '0')

/** Start date of the fiscal year containing `today`. */
export function fiscalYearStart(startMonth: number, today: string): string {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const startYear = month >= startMonth ? year : year - 1
  return `${startYear}-${mm(startMonth)}-01`
}

/** The current fiscal year, start → today. */
export function currentFiscalYear(startMonth: number, today: string): DateRange {
  return { from: fiscalYearStart(startMonth, today), to: today }
}

/** The previous complete fiscal year. */
export function lastFiscalYear(startMonth: number, today: string): DateRange {
  const thisStart = fiscalYearStart(startMonth, today)
  const startYear = Number(thisStart.slice(0, 4))
  const from = `${startYear - 1}-${mm(startMonth)}-01`
  // Day before this FY's start: last day of the previous month.
  const endMonth = startMonth === 1 ? 12 : startMonth - 1
  const endYear = startMonth === 1 ? startYear - 1 : startYear
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
  return { from, to: `${endYear}-${mm(endMonth)}-${mm(lastDay)}` }
}

/** The same range one year earlier (Feb 29 clamps to Feb 28). */
export function sameRangeLastYear(range: DateRange): DateRange {
  const shift = (d: string) => {
    const year = Number(d.slice(0, 4)) - 1
    const monthDay = d.slice(5)
    if (monthDay === '02-29') return `${year}-02-28`
    return `${year}-${monthDay}`
  }
  return { from: shift(range.from), to: shift(range.to) }
}
