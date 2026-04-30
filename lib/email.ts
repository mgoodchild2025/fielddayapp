const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@fielddayapp.ca'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!RESEND_API_KEY) return // no-op when not configured

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    })
  } catch {
    // Email failures are non-fatal — invite still exists in the DB
  }
}

export function buildJoinRequestEmail({
  teamName,
  orgName,
  playerName,
  playerEmail,
  message,
  teamUrl,
}: {
  teamName: string
  orgName: string
  playerName: string
  playerEmail: string
  message: string | null
  teamUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${orgName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">New Join Request</h2>
      <p style="color:#6b7280;margin:0 0 8px;font-size:15px;line-height:1.6;">
        <strong>${playerName}</strong> (${playerEmail}) has requested to join <strong>${teamName}</strong>.
      </p>
      ${message ? `<p style="color:#374151;background:#f9fafb;border-left:3px solid #d1d5db;padding:10px 14px;margin:16px 0;font-size:14px;font-style:italic;">&ldquo;${message}&rdquo;</p>` : ''}
      <div style="text-align:center;margin:28px 0 20px;">
        <a href="${teamUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
          Review Request →
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
        Log in to approve or decline from the team page.
      </p>
    </div>
  </div>
</body>
</html>`
}

export function buildJoinApprovedEmail({
  teamName,
  orgName,
  teamUrl,
}: {
  teamName: string
  orgName: string
  teamUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${orgName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">You&rsquo;re on the team! 🎉</h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:15px;line-height:1.6;">
        Your request to join <strong>${teamName}</strong> has been approved. Welcome to the team!
      </p>
      <div style="text-align:center;margin:28px 0 20px;">
        <a href="${teamUrl}"
           style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
          View Your Team →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function buildJoinDeclinedEmail({
  teamName,
  orgName,
}: {
  teamName: string
  orgName: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${orgName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Request Not Approved</h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:15px;line-height:1.6;">
        Your request to join <strong>${teamName}</strong> was not approved at this time.
        Reach out to the team captain or organiser for more information.
      </p>
    </div>
  </div>
</body>
</html>`
}

export function buildPickupInviteEmail({
  orgName,
  leagueName,
  inviteUrl,
}: {
  orgName: string
  leagueName: string
  inviteUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${orgName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">You&rsquo;re invited!</h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:15px;line-height:1.6;">
        You&rsquo;ve been invited to join <strong>${leagueName}</strong>.
        Click below to view the event and register.
      </p>
      <div style="text-align:center;margin:28px 0 20px;">
        <a href="${inviteUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
          View Event &amp; Register →
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:16px 0 0;">
        You&rsquo;ll need to log in or create an account with this email address to access the event.
      </p>
    </div>
  </div>
</body>
</html>`
}

export function buildTeamInviteEmail({
  teamName,
  orgName,
  invitedBy,
  role,
  acceptUrl,
  declineUrl,
}: {
  teamName: string
  orgName: string
  invitedBy: string
  role: string
  acceptUrl: string
  declineUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${orgName}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Team Invitation</h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:15px;line-height:1.6;">
        <strong>${invitedBy}</strong> has invited you to join <strong>${teamName}</strong> as a <strong>${role}</strong>.
      </p>
      <div style="text-align:center;margin:32px 0 24px;">
        <a href="${acceptUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0 0 8px;">
        Not interested? <a href="${declineUrl}" style="color:#6b7280;">Decline this invitation</a>
      </p>
      <p style="color:#d1d5db;font-size:12px;text-align:center;margin:16px 0 0;">
        This invitation expires in 7 days.
      </p>
    </div>
  </div>
</body>
</html>`
}
