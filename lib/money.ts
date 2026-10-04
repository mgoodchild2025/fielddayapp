/**
 * "$72.50" / "$75" — whole dollars stay clean, cents are never rounded away.
 * Prices used toFixed(0), so a $72.50 fee read "Pay $73" and the charge
 * matched neither number.
 */
export function formatDollars(cents: number): string {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}`
}
