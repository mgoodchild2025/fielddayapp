/**
 * Captain/coach "still need to register" reminder — sent 24 hours before an
 * event that has a waiver. Lists teammates who haven't registered and, when the
 * event sets a minimum team size, whether the team has enough players ready.
 */
import { escapeHtml } from '@/lib/html-escape'
import { plural, rosterMinimum } from '@/lib/roster-minimum'
import {
  banner, button, emailShell, minimumMeter, peopleSection, resolveBrand,
  type EmailBrand, type Tone,
} from './captain-email-layout'

export interface RegistrationReminderData {
  orgName: string
  brand?: EmailBrand | null
  leagueName: string
  teamName: string
  dateLabel: string
  teamUrl: string
  registerUrl: string
  minTeamSize?: number | null
  /** Players + captains registered with the waiver signed. */
  readyCount: number
  /** Names of players + captains registered but not yet signed. */
  needsWaiver: string[]
  /** Names of players + captains on the roster who haven't registered. */
  notRegistered: string[]
}

/** Null when there's nothing to tell the captain (everyone registered, minimum met). */
export function buildCaptainRegistrationReminderEmail(d: RegistrationReminderData): { subject: string; html: string } | null {
  const min = rosterMinimum(
    { ready: d.readyCount, needsWaiver: d.needsWaiver.length, notRegistered: d.notRegistered.length },
    d.minTeamSize,
  )
  if (d.notRegistered.length === 0 && min.short === 0) return null

  const brand = resolveBrand(d.brand)
  const n = d.notRegistered.length

  let tone: Tone
  let title: string
  let body: string
  if (min.verdict === 'short') {
    tone = 'bad'
    title = `${d.teamName} is ${plural(min.short, 'player')} short`
    body = `You need at least ${min.minimum} players ready tomorrow and have ${d.readyCount}.`
      + (n > 0 ? ` ${plural(n, 'teammate')} still ${n === 1 ? 'needs' : 'need'} to register.` : ' Invite more players today.')
  } else if (min.verdict === 'short_waivers') {
    tone = 'warn'
    title = `${plural(min.short, 'waiver')} away from the minimum`
    body = `You have ${d.readyCount} of the ${min.minimum} players you need. ${plural(d.needsWaiver.length, 'registered player has', 'registered players have')} still to sign the waiver.`
  } else {
    tone = 'warn'
    title = `${plural(n, 'player')} still ${n === 1 ? 'needs' : 'need'} to register`
    body = `Registering includes signing the waiver, which everyone needs before they can play — and it makes check-in faster.`
  }

  const subject = min.short > 0
    ? `${d.teamName} needs ${plural(min.short, 'more player')} ready for ${d.leagueName} tomorrow`
    : `Reminder: ${plural(n, 'player')} still ${n === 1 ? 'needs' : 'need'} to register for ${d.leagueName}`

  const meterTone: Tone = min.verdict === 'enough' ? 'good' : min.verdict === 'short_waivers' ? 'warn' : 'bad'

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${brand.ink};">Starts tomorrow</p>
    <h1 style="margin:0 0 2px;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(d.teamName)}</h1>
    <p style="margin:0 0 22px;font-size:15px;color:#4b5563;">${escapeHtml(d.leagueName)} &middot; ${escapeHtml(d.dateLabel)}</p>

    ${banner(tone, '⚠️', title, body)}

    ${min.minimum !== null ? minimumMeter(d.readyCount, min.minimum, meterTone) : ''}

    ${peopleSection('bad', 'Still need to register', d.notRegistered.map(name => ({ name })))}
    ${peopleSection('warn', 'Need to sign the waiver', d.needsWaiver.map(name => ({ name })))}

    <div style="margin:8px 0 14px;">
      ${button(brand, d.teamUrl, 'Open your team page')}
    </div>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#374151;">
      Tap <strong>Remind</strong> next to a name to nudge them, or share the registration link:<br>
      <a href="${escapeHtml(d.registerUrl)}" style="color:${brand.ink};word-break:break-all;">${escapeHtml(d.registerUrl)}</a>
    </p>
  `

  const html = emailShell({
    orgName: d.orgName,
    brand,
    preheader: `${title}. ${body}`,
    bodyHtml,
    footerNote: `You're getting this as a captain or coach of ${d.teamName}. It's sent the day before your event starts.`,
  })
  return { subject, html }
}
