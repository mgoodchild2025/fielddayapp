'use server'

import { getResend, FROM_EMAIL } from '@/lib/resend'

/** Escape user-supplied strings before interpolating into HTML email bodies. */
function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const SPORT_EMOJI: Record<string, string> = {
  volleyball:      '🏐',
  beach_volleyball:'🏐',
  basketball:      '🏀',
  soccer:          '⚽',
  hockey:          '🏒',
  baseball:        '⚾',
  softball:        '🥎',
  flag_football:   '🏈',
  ultimate_frisbee:'🥏',
  tennis:          '🎾',
  pickleball:      '🏓',
  kickball:        '🔴',
  dodgeball:       '🔴',
}

/** Format "HH:MM:SS" or "HH:MM" → "7:00 PM" */
function fmtEmailTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`
}

/** Format "YYYY-MM-DD" → "June 2, 2026" (UTC-safe, no timezone shift) */
function fmtEmailDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(Date.UTC(y, m - 1, day))
}

/** ['mon','tue','thu'] → "Mon, Tue & Thu" */
function fmtDays(days: string[]): string {
  const labels: Record<string, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  }
  const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const labelled = sorted.map(d => labels[d] ?? d)
  if (labelled.length === 1) return labelled[0]
  return `${labelled.slice(0, -1).join(', ')} & ${labelled[labelled.length - 1]}`
}

export async function sendRegistrationConfirmation({
  email,
  name,
  leagueName,
  orgName,
  sport,
  eventType,
  checkinUrl,
  calendarCtaHtml,
  seasonStartDate,
  gameStartTime,
  gameEndTime,
  daysOfWeek,
  venueName,
  venueAddress,
  venueMapsUrl,
}: {
  email: string
  name: string
  leagueName: string
  orgName: string
  sport?: string | null
  eventType?: string | null
  checkinUrl?: string | null
  calendarCtaHtml?: string | null
  seasonStartDate?: string | null
  gameStartTime?: string | null
  gameEndTime?: string | null
  daysOfWeek?: string[] | null
  venueName?: string | null
  venueAddress?: string | null
  venueMapsUrl?: string | null   // retained for API compat; no longer used in email rendering
}) {
  const sportEmoji = (sport && SPORT_EMOJI[sport]) ?? '🎉'
  const showCheckin = !!checkinUrl
  const qrImageUrl = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinUrl)}`
    : null

  // ── Event details block (start date + schedule) ─────────────────────────────
  const scheduleRows: string[] = []
  if (seasonStartDate) {
    scheduleRows.push(
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;white-space:nowrap;padding-right:12px;">Season starts</td>` +
      `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${fmtEmailDate(seasonStartDate)}</td></tr>`
    )
  }
  const hasDays = daysOfWeek && daysOfWeek.length > 0
  const hasTime = gameStartTime || gameEndTime
  if (hasDays || hasTime) {
    const dayLabel = hasDays ? fmtDays(daysOfWeek!) : ''
    const timeLabel = gameStartTime && gameEndTime
      ? `${fmtEmailTime(gameStartTime)} – ${fmtEmailTime(gameEndTime)}`
      : gameStartTime ? `From ${fmtEmailTime(gameStartTime)}`
      : gameEndTime  ? `Until ${fmtEmailTime(gameEndTime!)}` : ''
    const scheduleVal = [dayLabel, timeLabel].filter(Boolean).join(' · ')
    scheduleRows.push(
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;white-space:nowrap;padding-right:12px;">Schedule</td>` +
      `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${esc(scheduleVal)}</td></tr>`
    )
  }

  const eventDetailsBlock = scheduleRows.length > 0 ? `
    <div style="margin:24px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">Event Details</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        <tbody>${scheduleRows.join('')}</tbody>
      </table>
    </div>
  ` : ''

  // ── Location block — tappable link opens device's default maps app ──────────
  let locationBlock = ''
  if (venueName || venueAddress) {
    // https://maps.google.com/maps?q= is recognised by both iOS (opens Apple/Google Maps)
    // and Android (opens the default maps app) without requiring any protocol tricks.
    const mapsQuery = encodeURIComponent(venueAddress ?? venueName ?? '')
    const mapsUrl = venueMapsUrl || `https://maps.google.com/maps?q=${mapsQuery}`

    locationBlock = `
      <div style="margin:24px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">Location</p>
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
          style="display:inline-flex;align-items:flex-start;gap:8px;text-decoration:none;">
          <span style="font-size:18px;line-height:1.3;flex-shrink:0;">📍</span>
          <div>
            ${venueName ? `<p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:14px;">${esc(venueName)}</p>` : ''}
            ${venueAddress ? `<p style="margin:0;color:#374151;font-size:13px;">${esc(venueAddress)}</p>` : ''}
          </div>
        </a>
      </div>
    `
  }

  // ── Check-in QR block ────────────────────────────────────────────────────────
  const checkinBlock = showCheckin ? `
    <div style="margin-top: 32px; padding: 24px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; text-align: center;">
      <p style="font-size: 16px; font-weight: 600; color: #15803d; margin: 0 0 4px;">Your Check-in QR Code</p>
      <p style="font-size: 13px; color: #166534; margin: 0 0 16px;">Show this at the event to check in quickly</p>
      <img src="${qrImageUrl}" width="180" height="180" alt="Check-in QR Code"
        style="display: block; margin: 0 auto 16px; border-radius: 8px; border: 4px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.12);" />
      <a href="${checkinUrl}" style="font-size: 12px; color: #15803d; word-break: break-all;">${checkinUrl}</a>
    </div>
  ` : ''

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `You're registered for ${leagueName}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 8px;">You're in! ${sportEmoji}</h1>
        <p style="color: #444; font-size: 16px;">Hi ${esc(name)},</p>
        <p style="color: #444; font-size: 16px;">
          You're officially registered for <strong>${esc(leagueName)}</strong> with ${esc(orgName)}.
        </p>
        ${eventDetailsBlock}
        ${locationBlock}
        <p style="color: #444; font-size: 16px;">
          Log in to view your schedule, team info, and more.
        </p>
        ${calendarCtaHtml ?? ''}
        ${checkinBlock}
        <div style="margin-top: 32px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-size: 14px; color: #666;">
          Questions? Reply to this email and we'll get back to you.
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.6;">
          You&rsquo;re receiving this because you registered for an event with <strong>${esc(orgName)}</strong>, powered by Fieldday.
        </p>
      </div>
    `,
  })
}

export async function sendWaiverSigningRequest({
  email,
  name,
  leagueName,
  orgName,
  signUrl,
}: {
  email: string
  name: string
  leagueName: string
  orgName: string
  signUrl: string
}) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Action required: Sign your waiver for ${leagueName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">Waiver Signature Required</h1>
        <p style="color: #444; font-size: 16px;">Hi ${esc(name)},</p>
        <p style="color: #444; font-size: 16px;">
          You need to sign the waiver for <strong>${esc(leagueName)}</strong> with ${esc(orgName)} before your first game.
        </p>
        <div style="margin-top: 28px; margin-bottom: 28px; text-align: center;">
          <a
            href="${signUrl}"
            style="display: inline-block; background-color: #1f2937; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 28px; border-radius: 8px;"
          >
            Sign Waiver →
          </a>
        </div>
        <div style="margin-top: 32px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-size: 14px; color: #666;">
          Questions? Reply to this email.
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.6;">
          You&rsquo;re receiving this because you&rsquo;re registered with <strong>${esc(orgName)}</strong>, powered by Fieldday.
        </p>
      </div>
    `,
  })
}

/** Payment method values for admin registration notifications. */
export type RegistrationPaymentMethod =
  | 'free'        // no payment required
  | 'card'        // paid via Stripe (credit/debit card)
  | 'etransfer'   // offline — awaiting e-transfer
  | 'cash'        // offline — awaiting cash
  | 'cheque'      // offline — awaiting cheque

function paymentMethodLine(method: RegistrationPaymentMethod | null | undefined): string {
  if (!method) return ''
  const MAP: Record<RegistrationPaymentMethod, { label: string; badge: string; color: string }> = {
    free:      { label: 'Free — no payment required',       badge: '✓',  color: '#15803d' },
    card:      { label: 'Paid by credit card',              badge: '✓',  color: '#15803d' },
    etransfer: { label: 'Awaiting e-transfer from player',  badge: '⏳', color: '#b45309' },
    cash:      { label: 'Awaiting cash from player',        badge: '⏳', color: '#b45309' },
    cheque:    { label: 'Awaiting cheque from player',      badge: '⏳', color: '#b45309' },
  }
  const { label, badge, color } = MAP[method]
  return `<p style="color:${color};font-size:15px;margin:4px 0;"><strong>Payment:</strong> ${badge} ${label}</p>`
}

export async function sendRegistrationAdminNotification({
  to,
  playerName,
  playerEmail,
  leagueName,
  orgName,
  adminUrl,
  paymentMethod,
}: {
  to: string | string[]
  playerName: string | null
  playerEmail: string | null
  leagueName: string
  orgName: string
  adminUrl: string
  /** When provided, shown so admins know if they need to collect payment. */
  paymentMethod?: RegistrationPaymentMethod | null
}) {
  const displayName = playerName ?? playerEmail ?? 'A player'
  const emailLine = playerEmail
    ? `<p style="color:#444;font-size:15px;margin:4px 0;"><strong>Email:</strong> ${playerEmail}</p>`
    : ''

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New registration — ${leagueName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;font-weight:bold;margin-bottom:4px;">New Registration 🎉</h1>
        <p style="color:#555;font-size:15px;margin-top:0;">Someone just registered for one of your events on ${orgName}.</p>

        <div style="margin:24px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
          <p style="color:#444;font-size:15px;margin:4px 0;"><strong>Player:</strong> ${esc(displayName)}</p>
          ${emailLine}
          <p style="color:#444;font-size:15px;margin:4px 0;"><strong>Event:</strong> ${esc(leagueName)}</p>
          ${paymentMethodLine(paymentMethod)}
        </div>

        <a href="${adminUrl}"
          style="display:inline-block;margin-top:8px;padding:10px 22px;background:#111827;color:#fff;text-decoration:none;border-radius:7px;font-size:14px;font-weight:600;">
          View in Admin Portal →
        </a>

        <p style="color:#aaa;font-size:12px;margin-top:32px;">
          You're receiving this because registration notifications are enabled for ${esc(orgName)}.
          Turn them off in Admin → Settings → Notifications.
        </p>
      </div>
    `,
  })
}

/** Alert sent to org admins when a player's Stripe payment fails. */
export async function sendAdminPaymentFailedAlert({
  to,
  playerName,
  playerEmail,
  leagueName,
  amountLabel,
  orgName,
  adminUrl,
}: {
  to: string[]
  playerName: string | null
  playerEmail: string | null
  leagueName: string
  amountLabel: string | null
  orgName: string
  adminUrl: string
}) {
  if (to.length === 0) return
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Payment failed — ${playerName ?? 'a player'} · ${leagueName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 22px; font-weight: bold; margin-bottom: 8px;">A payment failed</h1>
        <p style="color: #444; font-size: 15px;">
          A Stripe payment for <strong>${esc(leagueName)}</strong> did not go through.
        </p>
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin:16px 0;">
          <tr><td style="padding:6px 0; color:#6b7280; width:120px;">Player</td><td>${esc(playerName ?? '—')}</td></tr>
          <tr><td style="padding:6px 0; color:#6b7280;">Email</td><td>${esc(playerEmail ?? '—')}</td></tr>
          ${amountLabel ? `<tr><td style="padding:6px 0; color:#6b7280;">Amount</td><td>${esc(amountLabel)}</td></tr>` : ''}
        </table>
        <p style="color:#6b7280; font-size:13px;">
          The player's spot is not confirmed. They've been prompted to retry. No action is required unless you want to follow up.
        </p>
        <a href="${adminUrl}" style="display:inline-block; background:#111; color:#fff; text-decoration:none; font-size:14px; font-weight:600; padding:10px 20px; border-radius:8px; margin-top:8px;">View payments →</a>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin:24px 0 0; border-top:1px solid #f3f4f6; padding-top:16px;">
          Sent to admins of <strong>${esc(orgName)}</strong>, powered by Fieldday.
        </p>
      </div>
    `,
  })
}

export async function sendPaymentFailedEmail({
  email,
  name,
  leagueName,
}: {
  email: string
  name: string
  leagueName: string
}) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Payment failed for ${leagueName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">Payment failed</h1>
        <p style="color: #444; font-size: 16px;">Hi ${esc(name)},</p>
        <p style="color: #444; font-size: 16px;">
          Unfortunately your payment for <strong>${esc(leagueName)}</strong> didn't go through.
        </p>
        <p style="color: #444; font-size: 16px;">
          Please log in and retry your registration to secure your spot.
        </p>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.6;">
          You&rsquo;re receiving this because you attempted to register for an event with <strong>${esc(leagueName)}</strong>, powered by Fieldday.
        </p>
      </div>
    `,
  })
}

export async function sendSignupConfirmation({
  email,
  fullName,
  confirmUrl,
}: {
  email: string
  fullName: string
  confirmUrl: string
}) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Confirm your email to get started',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">Almost there!</h1>
        <p style="color: #444; font-size: 16px;">Hi ${esc(fullName)},</p>
        <p style="color: #444; font-size: 16px;">
          Click the button below to confirm your email address and activate your account.
        </p>
        <div style="margin-top: 28px; margin-bottom: 28px; text-align: center;">
          <a
            href="${esc(confirmUrl)}"
            style="display: inline-block; background-color: #1f2937; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 28px; border-radius: 8px;"
          >
            Confirm my email →
          </a>
        </div>
        <p style="color: #999; font-size: 13px; text-align: center;">
          This link expires in 24 hours. If you didn&rsquo;t create an account, you can safely ignore this email.
        </p>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.6;">
          You&rsquo;re receiving this because someone used this email address to sign up for Fieldday.<br>
          If this wasn&rsquo;t you, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}

export interface MerchOrderLine {
  itemName: string
  variantLabel: string | null
  quantity: number
  unitPriceCents: number
  currency: string
}

/**
 * Notify org admins that a new merchandise order needs to be fulfilled.
 * Sent after Stripe confirms payment (or when an offline payment is recorded).
 */
export async function sendMerchOrderAdminNotification({
  to,
  buyerName,
  buyerEmail,
  orgName,
  source,     // 'shop' | 'registration'
  eventName,  // null for standalone shop orders
  lines,
  adminUrl,
}: {
  to: string | string[]
  buyerName: string | null
  buyerEmail: string | null
  orgName: string
  source: 'shop' | 'registration'
  eventName: string | null
  lines: MerchOrderLine[]
  adminUrl: string
}) {
  const displayName = buyerName ?? buyerEmail ?? 'A customer'
  const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
  const currency = lines[0]?.currency?.toUpperCase() ?? 'CAD'
  const sourceLabel = source === 'shop' ? 'Shop' : `Event registration${eventName ? ` — ${esc(eventName)}` : ''}`

  const lineRows = lines.map((l) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151">
        ${esc(l.itemName)}${l.variantLabel ? ` <span style="color:#6b7280">(${esc(l.variantLabel)})</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;text-align:center">×${l.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;text-align:right">
        $${(l.unitPriceCents * l.quantity / 100).toFixed(2)}
      </td>
    </tr>`
  ).join('')

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New merch order — ${orgName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;font-weight:bold;margin-bottom:4px;">New Merchandise Order 🛍️</h1>
        <p style="color:#555;font-size:15px;margin-top:0;">
          A new order was placed and needs to be fulfilled.
        </p>

        <div style="margin:20px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
          <p style="color:#444;font-size:15px;margin:4px 0;"><strong>Customer:</strong> ${esc(displayName)}</p>
          ${buyerEmail ? `<p style="color:#444;font-size:15px;margin:4px 0;"><strong>Email:</strong> ${esc(buyerEmail)}</p>` : ''}
          <p style="color:#444;font-size:15px;margin:4px 0;"><strong>Source:</strong> ${sourceLabel}</p>
          <p style="color:#15803d;font-size:15px;margin:4px 0;"><strong>Payment:</strong> ✓ Paid by credit card</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr>
              <th style="text-align:left;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="text-align:center;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">Qty</th>
              <th style="text-align:right;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding-top:10px;font-weight:700;font-size:15px;color:#111;">Order Total</td>
              <td style="padding-top:10px;font-weight:700;font-size:15px;color:#111;text-align:right;">$${(totalCents / 100).toFixed(2)} ${currency}</td>
            </tr>
          </tfoot>
        </table>

        <a href="${adminUrl}"
          style="display:inline-block;margin-top:16px;padding:10px 22px;background:#111827;color:#fff;text-decoration:none;border-radius:7px;font-size:14px;font-weight:600;">
          View &amp; Fulfil Order →
        </a>

        <p style="color:#aaa;font-size:12px;margin-top:32px;">
          You&rsquo;re receiving this because merchandise order notifications are enabled for ${esc(orgName)}.
          Turn them off in Admin → Settings → Notifications.
        </p>
      </div>
    `,
  })
}
