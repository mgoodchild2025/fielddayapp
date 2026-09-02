/** Recoverable tax inside a tax-inclusive gross amount at the given rate (half-up). */
export function backOutTax(grossCents: number, pct: number): number {
  if (!pct || !Number.isFinite(pct) || grossCents <= 0) return 0
  return Math.round(grossCents - grossCents / (1 + pct / 100))
}
