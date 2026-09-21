// WCAG 2.2 contrast maths for the org branding form.
//
// Org admins pick their own brand colours, and those become CSS variables on
// every public page — button fills, badges, body text. Nothing else in the
// system can catch a pale primary with white button text, because the values
// are runtime data, not code. This is the one place the risk can be surfaced
// at the moment the decision is made.

export const AA_NORMAL_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_NON_TEXT = 3

/** Parse #rgb or #rrggbb into 0-255 channels. Returns null when unparseable. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Relative luminance, per WCAG 2.x. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/**
 * Contrast ratio between two colours, 1 to 21.
 * Returns null when either colour cannot be parsed.
 */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Ratio rounded the way contrast tools report it, e.g. 4.54 → "4.54". */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2)
}

export interface ContrastCheck {
  ratio: number
  passes: boolean
  required: number
  message: string
}

/**
 * Check one foreground/background pair against a WCAG minimum.
 * `what` names the pair for the admin, e.g. "Body text on the page background".
 */
export function checkContrast(
  foreground: string,
  background: string,
  what: string,
  required: number = AA_NORMAL_TEXT,
): ContrastCheck | null {
  const ratio = contrastRatio(foreground, background)
  if (ratio === null) return null
  const passes = ratio >= required
  return {
    ratio,
    passes,
    required,
    message: passes
      ? `${what}: ${formatRatio(ratio)}:1 — meets the ${required}:1 minimum.`
      : `${what}: ${formatRatio(ratio)}:1 — below the ${required}:1 minimum for readability.`,
  }
}
