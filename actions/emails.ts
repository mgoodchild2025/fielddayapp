'use server'

import { getResend, FROM_EMAIL } from '@/lib/resend'

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

export async function sendRegistrationConfirmation({
  email,
  name,
  leagueName,
  orgName,
  sport,
  eventType,
  checkinUrl,
}: {
  email: string
  name: string
  leagueName: string
  orgName: string
  sport?: string | null
  eventType?: string | null
  checkinUrl?: string | null
}) {
  const sportEmoji = (sport && SPORT_EMOJI[sport]) ?? '🎉'
  const showCheckin = !!checkinUrl
  const qrImageUrl = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinUrl)}`
    : null

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
        <p style="color: #444; font-size: 16px;">Hi ${name},</p>
        <p style="color: #444; font-size: 16px;">
          You're officially registered for <strong>${leagueName}</strong> with ${orgName}.
        </p>
        <p style="color: #444; font-size: 16px;">
          Log in to view your schedule, team info, and more.
        </p>
        ${checkinBlock}
        <div style="margin-top: 32px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-size: 14px; color: #666;">
          Questions? Reply to this email and we'll get back to you.
        </div>
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
        <p style="color: #444; font-size: 16px;">Hi ${name},</p>
        <p style="color: #444; font-size: 16px;">
          You need to sign the waiver for <strong>${leagueName}</strong> with ${orgName} before your first game.
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
        <p style="color: #444; font-size: 16px;">Hi ${name},</p>
        <p style="color: #444; font-size: 16px;">
          Unfortunately your payment for <strong>${leagueName}</strong> didn't go through.
        </p>
        <p style="color: #444; font-size: 16px;">
          Please log in and retry your registration to secure your spot.
        </p>
      </div>
    `,
  })
}
