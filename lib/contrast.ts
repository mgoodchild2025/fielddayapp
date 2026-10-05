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

export const DARK_ON_BRAND = '#111827'

/**
 * Text colour for content sitting on a brand fill (buttons, badges, banners).
 *
 * White, unless white would fall below WCAG's 3:1 minimum for large/bold
 * text on this background — then near-black. The threshold is deliberately
 * the lenient one: saturated brand colours (e.g. #FF5C00 at 3.1:1) keep the
 * white text their org designed around, while genuinely pale picks (amber,
 * yellow, sky, light green — 1.3–2.5:1) stop producing unreadable buttons.
 * Unparseable input keeps white, the long-standing default.
 */
export function readableTextOn(background: string): string {
  const white = contrastRatio('#ffffff', background)
  if (white === null || white >= AA_LARGE_TEXT) return '#ffffff'
  const dark = contrastRatio(DARK_ON_BRAND, background) ?? 0
  return dark > white ? DARK_ON_BRAND : '#ffffff'
}

/**
 * The brand colour as TEXT on a white/near-white page: the colour itself when
 * it reads (≥ 4.5:1), else the same hue darkened just enough to reach 4.5:1.
 * The default #FF5C00 is 3.1:1 on white — fine for a button fill, too faint
 * for a link or a "Team stats →" label. Unparseable input passes through.
 */
export function inkOnWhite(color: string, minRatio = 4.5): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  if ((contrastRatio(color, '#ffffff') ?? 0) >= minRatio) return color
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  for (let k = 0.95; k >= 0; k -= 0.025) {
    const c = `#${toHex(rgb.r * k)}${toHex(rgb.g * k)}${toHex(rgb.b * k)}`
    if ((contrastRatio(c, '#ffffff') ?? 0) >= minRatio) return c
  }
  return '#111827'
}
