/**
 * Captain/coach prep email — sent 48 hours before an event start.
 *
 * Shared builder used by both the cron job and the "Send test email"
 * button so the test sample matches what captains actually receive.
 */
import { escapeHtml } from '@/lib/html-escape'
import { plural, rosterMinimum } from '@/lib/roster-minimum'
import {
  banner, button, emailShell, minimumMeter, peopleSection, resolveBrand, statTiles,
  type EmailBrand, type ListPerson, type Tone,
} from './captain-email-layout'

/** `isCoach`: coaches are listed but never counted toward the minimum team size. */
export type PrepPlayer = { name: string; email?: string | null; isCoach?: boolean }

export interface CaptainPrepData {
  orgName: string
  orgSlug: string
  platformDomain: string
  brand?: EmailBrand | null
  leagueName: string
  leagueSlug: string
  teamName: string
  teamId: string
  dateLabel: string          // human-readable event start, e.g. "Saturday, June 7"
  venueName?: string | null
  venueAddress?: string | null
  /** The event's minimum team size (`leagues.min_team_size`). Null/≤1 = no check. */
  minTeamSize?: number | null
  /** False hides the waiver column/wording. Defaults to true. */
  requiresWaiver?: boolean
  registered: PrepPlayer[]        // registered AND waiver signed (or no waiver required)
  needsWaiver: PrepPlayer[]       // registered but waiver not yet signed
  notRegistered: PrepPlayer[]     // on the roster but not registered
  invitedPending: PrepPlayer[]    // invited by email, hasn't joined/registered
}

const players = (list: PrepPlayer[]) => list.filter(p => !p.isCoach).length

function toPeople(list: PrepPlayer[]): ListPerson[] {
  return list.map(p => ({
    name: p.name,
    note: [p.isCoach ? 'Coach' : null, p.email && p.email !== p.name ? p.email : null].filter(Boolean).join(' · ') || null,
  }))
}

export function buildCaptainPrepEmail(d: CaptainPrepData): { subject: string; html: string } {
  const brand = resolveBrand(d.brand)
  const base = `https://${d.orgSlug}.${d.platformDomain}`
  const teamUrl = `${base}/teams/${d.teamId}`
  const registerUrl = `${base}/register/${d.leagueSlug}`
  const requiresWaiver = d.requiresWaiver !== false

  const outstanding = d.needsWaiver.length + d.notRegistered.length + d.invitedPending.length
  const ready = players(d.registered)
  const min = rosterMinimum(
    { ready, needsWaiver: players(d.needsWaiver), notRegistered: players(d.notRegistered) + d.invitedPending.length },
    d.minTeamSize,
  )

  // ── Headline: one sentence that tells the captain where they stand ────────
  let tone: Tone
  let title: string
  let body: string | undefined
  if (min.verdict === 'short') {
    tone = 'bad'
    title = `${d.teamName} is ${plural(min.short, 'player')} short`
    body = `${d.leagueName} needs at least ${min.minimum} players ready per team, and you have ${ready}. `
      + (outstanding > 0
        ? `Get the teammates below signed up, or invite more players before ${d.dateLabel}.`
        : `Invite more players before ${d.dateLabel}.`)
  } else if (min.verdict === 'short_waivers') {
    tone = 'warn'
    title = `${plural(min.short, 'waiver')} away from the minimum`
    body = `You have ${ready} of the ${min.minimum} players you need. ${plural(players(d.needsWaiver), 'registered player has', 'registered players have')} still to sign the waiver.`
  } else if (outstanding > 0) {
    tone = min.verdict === 'enough' ? 'good' : 'warn'
    title = min.verdict === 'enough'
      ? `You have enough players to play`
      : `${plural(outstanding, 'teammate')} still ${outstanding === 1 ? 'needs' : 'need'} to finish signing up`
    body = min.verdict === 'enough'
      ? `${plural(outstanding, 'teammate')} still ${outstanding === 1 ? 'needs' : 'need'} to finish signing up before ${d.dateLabel}.`
      : undefined
  } else {
    tone = 'good'
    title = `Everyone on ${d.teamName} is ready to play`
    body = `Nothing to do — see you ${d.dateLabel}.`
  }

  const subject = min.short > 0
    ? `${d.teamName} needs ${plural(min.short, 'more player')} ready — ${d.leagueName} starts ${d.dateLabel}`
    : outstanding > 0
      ? `${d.leagueName} starts ${d.dateLabel} — ${plural(outstanding, 'player')} ${outstanding === 1 ? 'needs' : 'need'} action`
      : `${d.leagueName} starts ${d.dateLabel} — ${d.teamName} is all set`

  const venue = [d.venueName, d.venueAddress].filter(Boolean).join(' · ')
  const detail = (icon: string, text: string) =>
    `<tr><td style="padding:2px 0;font-size:14px;color:#374151;">${icon}&nbsp; ${escapeHtml(text)}</td></tr>`

  const meterTone: Tone = min.verdict === 'enough' ? 'good' : min.verdict === 'short_waivers' ? 'warn' : 'bad'

  const tiles = [
    { value: d.registered.length, label: 'Ready', tone: 'good' as Tone },
    ...(requiresWaiver ? [{ value: d.needsWaiver.length, label: 'Waiver to sign', tone: 'warn' as Tone }] : []),
    { value: d.notRegistered.length, label: 'Not registered', tone: 'bad' as Tone },
    { value: d.invitedPending.length, label: 'Invited', tone: 'info' as Tone },
  ]

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${brand.ink};">Starts in 2 days</p>
    <h1 style="margin:0 0 2px;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(d.teamName)}</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#4b5563;">${escapeHtml(d.leagueName)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${detail('🗓️', d.dateLabel)}
      ${venue ? detail('📍', venue) : ''}
    </table>

    ${banner(tone, tone === 'good' ? '✅' : '⚠️', title, body)}

    ${min.minimum !== null ? minimumMeter(ready, min.minimum, meterTone) : ''}

    ${statTiles(tiles)}

    ${peopleSection('bad', 'Still need to register', toPeople(d.notRegistered), 'On your roster, but not signed up for this event yet.')}
    ${peopleSection('warn', 'Need to sign the waiver', toPeople(d.needsWaiver), 'Registered — they just need to sign before they can play.')}
    ${peopleSection('info', "Invited, haven't joined", toPeople(d.invitedPending), 'They have an invite email. You can resend it from your team page.')}
    ${peopleSection('good', 'Ready to play', toPeople(d.registered))}

    <div style="margin:8px 0 20px;">
      ${button(brand, teamUrl, outstanding > 0 || min.short > 0 ? 'Open your team page' : 'View your team')}
    </div>

    ${outstanding > 0 || min.short > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">How to get everyone signed up</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.55;color:#374151;">
          <tr><td valign="top" style="padding:3px 10px 3px 0;font-weight:700;color:${brand.ink};">1</td><td style="padding:3px 0;">Tap <strong>Remind</strong> next to anyone on your team page — they get an email and an app alert.</td></tr>
          <tr><td valign="top" style="padding:3px 10px 3px 0;font-weight:700;color:${brand.ink};">2</td><td style="padding:3px 0;">Need more players? Use <strong>Invite Player</strong> on the team page to add them by email.</td></tr>
          <tr><td valign="top" style="padding:3px 10px 3px 0;font-weight:700;color:${brand.ink};">3</td><td style="padding:3px 0;">Or share the registration link in your team chat:<br><a href="${escapeHtml(registerUrl)}" style="color:${brand.ink};word-break:break-all;">${escapeHtml(registerUrl)}</a></td></tr>
        </table>
        ${requiresWaiver ? `<p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Registering includes signing the waiver, which everyone needs before they can play.</p>` : ''}
      </td></tr>
    </table>` : ''}
  `

  const html = emailShell({
    orgName: d.orgName,
    brand,
    preheader: body ? `${title}. ${body}` : title,
    bodyHtml,
    footerNote: `You're getting this as a captain or coach of ${d.teamName}. It's sent 2 days before your event starts.`,
  })

  return { subject, html }
}

/** Sample data for the "Send test email" button. */
export function sampleCaptainPrepData(opts: {
  orgName: string
  orgSlug: string
  platformDomain: string
  brand?: EmailBrand | null
}): CaptainPrepData {
  return {
    orgName: opts.orgName,
    orgSlug: opts.orgSlug,
    platformDomain: opts.platformDomain,
    brand: opts.brand,
    leagueName: 'Sample Spring League',
    leagueSlug: 'sample-spring-league',
    teamName: 'The Sample Squad',
    teamId: '00000000-0000-0000-0000-000000000000',
    dateLabel: 'Saturday, June 7',
    venueName: 'Community Sports Centre',
    venueAddress: '123 Example St',
    minTeamSize: 5,
    registered: [
      { name: 'Alex Rivera', email: 'alex@example.com' },
      { name: 'Jordan Lee', email: 'jordan@example.com' },
    ],
    needsWaiver: [{ name: 'Sam Park', email: 'sam@example.com' }],
    notRegistered: [{ name: 'Casey Morgan', email: 'casey@example.com' }],
    invitedPending: [{ name: 'taylor@example.com', email: null }],
  }
}
