/**
 * Captain/coach prep email — sent 48 hours before an event start.
 *
 * Shared builder used by both the cron job and the "Send test email"
 * button so the test sample matches what captains actually receive.
 */

export type PrepPlayer = { name: string; email?: string | null }

export interface CaptainPrepData {
  orgName: string
  orgSlug: string
  platformDomain: string
  leagueName: string
  leagueSlug: string
  teamName: string
  teamId: string
  dateLabel: string          // human-readable event start, e.g. "Saturday, June 7"
  venueName?: string | null
  venueAddress?: string | null
  registered: PrepPlayer[]        // registered AND waiver signed (or no waiver required)
  needsWaiver: PrepPlayer[]       // registered but waiver not yet signed
  notRegistered: PrepPlayer[]     // on the roster but not registered
  invitedPending: PrepPlayer[]    // invited by email, hasn't joined/registered
}

function row(label: string, count: number, color: string) {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;">${label}</td>
    <td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px;color:${color};">${count}</td>
  </tr>`
}

function playerList(players: PrepPlayer[], emptyText: string): string {
  if (players.length === 0) {
    return `<p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">${emptyText}</p>`
  }
  return `<ul style="margin:4px 0 0;padding-left:20px;color:#374151;font-size:14px;line-height:1.7;">
    ${players.map(p => `<li>${escapeHtml(p.name)}${p.email ? ` <span style="color:#9ca3af;">— ${escapeHtml(p.email)}</span>` : ''}</li>`).join('')}
  </ul>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildCaptainPrepEmail(d: CaptainPrepData): { subject: string; html: string } {
  const base = `https://${d.orgSlug}.${d.platformDomain}`
  const teamUrl = `${base}/teams/${d.teamId}`
  const registerUrl = `${base}/register/${d.leagueSlug}`

  const outstanding = d.needsWaiver.length + d.notRegistered.length + d.invitedPending.length

  const subject = outstanding > 0
    ? `${d.leagueName} starts ${d.dateLabel} — ${outstanding} player${outstanding !== 1 ? 's' : ''} need action`
    : `${d.leagueName} starts ${d.dateLabel} — ${d.teamName} is all set`

  const venueLine = d.venueName || d.venueAddress
    ? `<p style="color:#6b7280;font-size:14px;margin:2px 0;">📍 ${escapeHtml(d.venueName ?? '')}${d.venueName && d.venueAddress ? ' · ' : ''}${escapeHtml(d.venueAddress ?? '')}</p>`
    : ''

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin:0 0 4px;">${escapeHtml(d.orgName)}</p>
    <h2 style="margin:0 0 4px;font-size:22px;">Your event starts in 2 days</h2>
    <p style="color:#374151;font-size:15px;margin:0 0 2px;"><strong>${escapeHtml(d.leagueName)}</strong> · ${escapeHtml(d.teamName)}</p>
    <p style="color:#6b7280;font-size:14px;margin:2px 0;">🗓️ ${escapeHtml(d.dateLabel)}</p>
    ${venueLine}

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:20px 0;">
      <p style="margin:0 0 8px;font-weight:600;font-size:14px;">Roster status</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('✅ Registered &amp; waiver signed', d.registered.length, '#16a34a')}
        ${row('⚠️ Registered — waiver not signed', d.needsWaiver.length, '#d97706')}
        ${row('❌ On roster — not registered', d.notRegistered.length, '#dc2626')}
        ${row('✉️ Invited — not joined yet', d.invitedPending.length, '#6b7280')}
      </table>
    </div>

    ${d.needsWaiver.length > 0 ? `
    <p style="font-weight:600;font-size:14px;margin:18px 0 0;color:#d97706;">Need to sign the waiver</p>
    ${playerList(d.needsWaiver, '')}` : ''}

    ${d.notRegistered.length > 0 ? `
    <p style="font-weight:600;font-size:14px;margin:18px 0 0;color:#dc2626;">Still need to register</p>
    ${playerList(d.notRegistered, '')}` : ''}

    ${d.invitedPending.length > 0 ? `
    <p style="font-weight:600;font-size:14px;margin:18px 0 0;color:#374151;">Invited — haven't joined</p>
    ${playerList(d.invitedPending, '')}` : ''}

    ${d.registered.length > 0 ? `
    <p style="font-weight:600;font-size:14px;margin:18px 0 0;color:#16a34a;">Ready to play</p>
    ${playerList(d.registered, '')}` : ''}

    <div style="margin:24px 0 8px;">
      <a href="${teamUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;margin-right:8px;">
        Manage your team →
      </a>
    </div>

    <div style="background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;font-weight:600;font-size:14px;color:#1e40af;">How to get everyone signed up</p>
      <ol style="margin:0;padding-left:18px;color:#1e3a8a;font-size:13px;line-height:1.7;">
        <li>Open your <a href="${teamUrl}" style="color:#1d4ed8;">team page</a> and use <strong>Invite Player</strong> to add teammates by email.</li>
        <li>Each invited player gets a link to create an account and register.</li>
        <li>Registration includes signing the waiver — required before they can play.</li>
        <li>Or share this direct registration link: <a href="${registerUrl}" style="color:#1d4ed8;">${registerUrl}</a></li>
      </ol>
    </div>

    <p style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.6;">
      You're receiving this as a team captain or coach with <strong>${escapeHtml(d.orgName)}</strong>, powered by Fieldday.<br>
      This prep reminder is sent 48 hours before your event start.
    </p>
  </div>`

  return { subject, html }
}

/** Sample data for the "Send test email" button. */
export function sampleCaptainPrepData(opts: {
  orgName: string
  orgSlug: string
  platformDomain: string
}): CaptainPrepData {
  return {
    orgName: opts.orgName,
    orgSlug: opts.orgSlug,
    platformDomain: opts.platformDomain,
    leagueName: 'Sample Spring League',
    leagueSlug: 'sample-spring-league',
    teamName: 'The Sample Squad',
    teamId: '00000000-0000-0000-0000-000000000000',
    dateLabel: 'Saturday, June 7',
    venueName: 'Community Sports Centre',
    venueAddress: '123 Example St',
    registered: [
      { name: 'Alex Rivera', email: 'alex@example.com' },
      { name: 'Jordan Lee', email: 'jordan@example.com' },
    ],
    needsWaiver: [{ name: 'Sam Park', email: 'sam@example.com' }],
    notRegistered: [{ name: 'Casey Morgan', email: 'casey@example.com' }],
    invitedPending: [{ name: 'taylor@example.com', email: null }],
  }
}
