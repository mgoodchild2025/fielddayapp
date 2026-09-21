// Rolling window for the org Finances dashboard.
//
// getOrgPnl used to read an organization's entire payment, order, expense and
// allocation history on every page load and aggregate it in JavaScript, which
// grows without bound as seasons accumulate. The dashboard answers "how is the
// business doing lately", so it is bounded here; the date-ranged report at
// /admin/finances/report still answers "exactly what happened between X and Y"
// over all history.

export const DEFAULT_WINDOW_MONTHS = 12

export interface FinanceWindow {
  months: number
  /** Timestamp bound, for timestamptz columns (paid_at, created_at). */
  sinceIso: string
  /** YYYY-MM-DD bound, for date columns (incurred_on, received_on). */
  sinceDate: string
  /** Human label for the screen, so a bounded figure is never read as a lifetime total. */
  label: string
}

/**
 * Start of a rolling window ending now.
 *
 * Month arithmetic is clamped: going back from the 31st into a shorter month
 * lands on that month's last day rather than rolling forward into the next
 * one, which would silently narrow the window.
 */
export function rollingFinanceWindow(
  months: number = DEFAULT_WINDOW_MONTHS,
  now: Date = new Date(),
): FinanceWindow {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()

  const targetMonthIndex = m - months
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12

  // Last day of the target month, so day-of-month never overflows forward.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)

  const start = new Date(Date.UTC(
    targetYear, targetMonth, day,
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds(),
  ))

  return {
    months,
    sinceIso: start.toISOString(),
    sinceDate: start.toISOString().slice(0, 10),
    label: months === 12 ? 'Last 12 months' : `Last ${months} months`,
  }
}
