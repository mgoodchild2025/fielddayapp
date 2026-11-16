/**
 * Email-safe building blocks shared by the captain emails (48h prep digest and
 * the 24h "still need to register" reminder).
 *
 * Email clients ignore most CSS: everything here is tables + inline styles, no
 * flexbox, no CSS variables, no external stylesheets. Every string that comes
 * from people (names, team/event/org names, URLs) is escaped by the caller of
 * these helpers OR here — each helper documents which.
 */
import { escapeHtml } from '@/lib/html-escape'
import { inkOnWhite, readableTextOn } from '@/lib/contrast'

export const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

const DEFAULT_PRIMARY = '#FF5C00'
const DEFAULT_SECONDARY = '#111827'
const HEX = /^#[0-9a-fA-F]{6}$/

export interface EmailBrand {
  primary?: string | null
  secondary?: string | null
  logoUrl?: string | null
}

export interface ResolvedBrand {
  /** Button fill. */
  primary: string
  /** Text on the button fill. */
  onPrimary: string
  /** Brand colour used as text/links on white (≥ 4.5:1). */
  ink: string
  /** Header band. */
  secondary: string
  onSecondary: string
  /** Escaped, https-only logo URL, or null. */
  logoUrl: string | null
}

/** Stored colours are validated again here — anything odd falls back to the default. */
export function resolveBrand(b?: EmailBrand | null): ResolvedBrand {
  const primary = b?.primary && HEX.test(b.primary) ? b.primary : DEFAULT_PRIMARY
  const secondary = b?.secondary && HEX.test(b.secondary) ? b.secondary : DEFAULT_SECONDARY
  const logo = b?.logoUrl && /^https:\/\/[^\s"'<>]+$/.test(b.logoUrl) ? escapeHtml(b.logoUrl) : null
  return {
    primary,
    onPrimary: readableTextOn(primary),
    ink: inkOnWhite(primary),
    secondary,
    onSecondary: readableTextOn(secondary),
    logoUrl: logo,
  }
}

export type Tone = 'good' | 'warn' | 'bad' | 'info'

export const TONES: Record<Tone, { bg: string; border: string; text: string; strong: string }> = {
  good: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', strong: '#047857' },
  warn: { bg: '#fffbeb', border: '#fde68a', text: '#78350f', strong: '#b45309' },
  bad:  { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d', strong: '#b91c1c' },
  info: { bg: '#f3f4f6', border: '#e5e7eb', text: '#374151', strong: '#111827' },
}

/**
 * The whole document: grey page, white card, brand header band.
 * `orgName`, `preheader` and `footerNote` are plain text (escaped here);
 * `bodyHtml` is markup built from escaped parts.
 */
export function emailShell(opts: {
  orgName: string
  brand: ResolvedBrand
  preheader: string
  bodyHtml: string
  footerNote: string
}): string {
  const { brand } = opts
  const orgName = escapeHtml(opts.orgName)
  const logo = brand.logoUrl
    ? `<td style="padding-right:12px;vertical-align:middle;" width="40"><img src="${brand.logoUrl}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:8px;background:#ffffff;object-fit:contain;"></td>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${orgName}</title>
<style>
  @media (max-width: 480px) {
    .fd-outer { padding: 0 !important; }
    .fd-card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .fd-pad { padding-left: 18px !important; padding-right: 18px !important; }
    .fd-tiles { border-spacing: 4px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td class="fd-outer" align="center" style="padding:24px 12px;">
    <table class="fd-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;font-family:${FONT};color:#111827;">
      <tr><td class="fd-pad" style="background:${brand.secondary};padding:18px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${logo}
          <td style="vertical-align:middle;color:${brand.onSecondary};font-size:15px;font-weight:700;letter-spacing:0.02em;">${orgName}</td>
        </tr></table>
      </td></tr>
      <tr><td class="fd-pad" style="padding:28px 28px 8px;">
        ${opts.bodyHtml}
      </td></tr>
      <tr><td class="fd-pad" style="padding:8px 28px 28px;">
        <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #f3f4f6;color:#6b7280;font-size:12px;line-height:1.6;">
          ${escapeHtml(opts.footerNote)}<br>
          Sent by <strong>${orgName}</strong>, powered by Fieldday.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** Big brand button. `label` plain text, `href` raw URL (both escaped here). */
export function button(brand: ResolvedBrand, href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr>
    <td style="background:${brand.primary};border-radius:10px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;color:${brand.onPrimary};text-decoration:none;font-weight:700;font-size:15px;font-family:${FONT};">${escapeHtml(label)}</a>
    </td>
  </tr></table>`
}

/** Coloured callout. `title` and `body` plain text (escaped here). */
export function banner(tone: Tone, icon: string, title: string, body?: string): string {
  const t = TONES[tone]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${t.bg};border:1px solid ${t.border};border-radius:12px;">
    <tr><td style="padding:14px 16px;">
      <p style="margin:0;font-size:16px;font-weight:700;color:${t.strong};line-height:1.35;">${icon}&nbsp; ${escapeHtml(title)}</p>
      ${body ? `<p style="margin:4px 0 0;font-size:14px;color:${t.text};line-height:1.5;">${escapeHtml(body)}</p>` : ''}
    </td></tr>
  </table>`
}

/**
 * "3 of 5 players ready" bar. Rendered with table cells (no CSS width tricks)
 * so Outlook draws it too.
 */
export function minimumMeter(ready: number, minimum: number, tone: Tone): string {
  const pct = Math.max(0, Math.min(100, Math.round((ready / minimum) * 100)))
  const fill = TONES[tone].strong
  const cells = [
    pct > 0 ? `<td width="${pct}%" style="background:${fill};height:10px;font-size:0;line-height:0;">&nbsp;</td>` : '',
    pct < 100 ? `<td width="${100 - pct}%" style="background:#e5e7eb;height:10px;font-size:0;line-height:0;">&nbsp;</td>` : '',
  ].join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">
      <tr>
        <td style="font-size:13px;color:#374151;font-weight:600;">Players ready</td>
        <td align="right" style="font-size:13px;color:#374151;"><strong style="color:${fill};font-size:15px;">${ready}</strong> of ${minimum} minimum</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-radius:999px;overflow:hidden;"><tr>${cells}</tr></table>`
}

/** Row of number tiles. Labels are fixed strings from our code. */
export function statTiles(tiles: Array<{ value: number; label: string; tone: Tone }>): string {
  const w = Math.floor(100 / tiles.length)
  return `<table class="fd-tiles" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:6px 0;table-layout:fixed;"><tr>
    ${tiles.map(t => {
      const muted = t.value === 0
      const c = muted ? TONES.info : TONES[t.tone]
      return `<td width="${w}%" align="center" style="background:${muted ? '#f9fafb' : c.bg};border:1px solid ${muted ? '#f3f4f6' : c.border};border-radius:10px;padding:12px 4px;vertical-align:top;">
        <div style="font-size:24px;font-weight:800;line-height:1;color:${muted ? '#9ca3af' : c.strong};">${t.value}</div>
        <div style="margin-top:6px;font-size:11px;line-height:1.3;color:${muted ? '#6b7280' : c.text};">${t.label}</div>
      </td>`
    }).join('')}
  </tr></table>`
}

export type ListPerson = { name: string; note?: string | null }

/** Titled list of people. `title`/`hint` plain text; people escaped here. */
export function peopleSection(tone: Tone, title: string, people: ListPerson[], hint?: string): string {
  if (people.length === 0) return ''
  const t = TONES[tone]
  const rows = people.map(p => `<tr><td style="padding:7px 0;border-top:1px solid #f3f4f6;font-size:14px;color:#111827;">
      ${escapeHtml(p.name)}${p.note ? `<span style="color:#6b7280;font-size:13px;"> &middot; ${escapeHtml(p.note)}</span>` : ''}
    </td></tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="padding:0 0 6px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${t.strong};vertical-align:middle;"></span>
      <span style="font-size:14px;font-weight:700;color:#111827;vertical-align:middle;">&nbsp;${escapeHtml(title)}</span>
      <span style="font-size:13px;color:#6b7280;vertical-align:middle;">&nbsp;(${people.length})</span>
      ${hint ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(hint)}</div>` : ''}
    </td></tr>
    ${rows}
  </table>`
}
