'use server'

import { getResend, FROM_EMAIL } from '@/lib/resend'

export async function sendRegistrationConfirmation({
  email,
  name,
  leagueName,
  orgName,
}: {
  email: string
  name: string
  leagueName: string
  orgName: string
}) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `You're registered for ${leagueName}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 8px;">You're in! 🏐</h1>
        <p style="color: #444; font-size: 16px;">Hi ${name},</p>
        <p style="color: #444; font-size: 16px;">
          You're officially registered for <strong>${leagueName}</strong> with ${orgName}.
        </p>
        <p style="color: #444; font-size: 16px;">
          Log in to your dashboard to check your schedule, team info, and more.
        </p>
        <div style="margin-top: 32px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-size: 14px; color: #666;">
          Questions? Reply to this email and we'll get back to you.
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
