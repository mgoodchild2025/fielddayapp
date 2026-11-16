import { describe, expect, it } from 'vitest'
import { rosterMinimum } from './roster-minimum'
import { buildCaptainPrepEmail, sampleCaptainPrepData } from './emails/captain-prep'
import { buildCaptainRegistrationReminderEmail } from './emails/captain-registration-reminder'

describe('rosterMinimum', () => {
  it('ignores a missing or trivial minimum', () => {
    expect(rosterMinimum({ ready: 0, needsWaiver: 0, notRegistered: 0 }, null).verdict).toBe('no_minimum')
    expect(rosterMinimum({ ready: 0, needsWaiver: 0, notRegistered: 0 }, 1).verdict).toBe('no_minimum')
    expect(rosterMinimum({ ready: 0, needsWaiver: 0, notRegistered: 0 }, Number.NaN).verdict).toBe('no_minimum')
  })

  it('is enough at or above the minimum', () => {
    expect(rosterMinimum({ ready: 5, needsWaiver: 0, notRegistered: 3 }, 5)).toEqual({ minimum: 5, verdict: 'enough', short: 0 })
    expect(rosterMinimum({ ready: 7, needsWaiver: 0, notRegistered: 0 }, 5).verdict).toBe('enough')
  })

  it('is short by waivers when signing would cover it', () => {
    expect(rosterMinimum({ ready: 3, needsWaiver: 2, notRegistered: 0 }, 5)).toEqual({ minimum: 5, verdict: 'short_waivers', short: 2 })
  })

  it('is short when even signed waivers would not cover it', () => {
    expect(rosterMinimum({ ready: 3, needsWaiver: 1, notRegistered: 4 }, 5)).toEqual({ minimum: 5, verdict: 'short', short: 2 })
  })
})

const base = { orgName: 'Acme', orgSlug: 'acme', platformDomain: 'fielddayapp.ca' }

describe('buildCaptainPrepEmail', () => {
  it('leads with the shortfall when the team is below the minimum', () => {
    const { subject, html } = buildCaptainPrepEmail({ ...sampleCaptainPrepData(base), minTeamSize: 6 })
    expect(subject).toBe('The Sample Squad needs 4 more players ready — Sample Spring League starts Saturday, June 7')
    expect(html).toContain('The Sample Squad is 4 players short')
    expect(html).toContain('of 6 minimum')
  })

  it('does not count coaches toward the minimum', () => {
    const d = sampleCaptainPrepData(base)
    d.minTeamSize = 3
    d.needsWaiver = []
    d.notRegistered = []
    d.invitedPending = []
    d.registered = [...d.registered, { name: 'Coach Kim', isCoach: true }]
    expect(buildCaptainPrepEmail(d).html).toContain('is 1 player short')
  })

  it('has no meter or shortfall without a minimum', () => {
    const { subject, html } = buildCaptainPrepEmail({ ...sampleCaptainPrepData(base), minTeamSize: null })
    expect(subject).toBe('Sample Spring League starts Saturday, June 7 — 3 players need action')
    expect(html).not.toContain('minimum')
  })

  it('escapes names and falls back from bad brand colours', () => {
    const d = sampleCaptainPrepData(base)
    d.teamName = '<script>x</script>'
    d.brand = { primary: 'red;}</style>', secondary: '#123456', logoUrl: 'javascript:alert(1)' }
    const { html } = buildCaptainPrepEmail(d)
    expect(html).not.toContain('<script>x')
    expect(html).not.toContain('red;}')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('#123456')
  })
})

describe('buildCaptainRegistrationReminderEmail', () => {
  const d = {
    orgName: 'Acme', leagueName: 'Fall Cup', teamName: 'Spikers', dateLabel: 'Saturday, November 21',
    teamUrl: 'https://acme.fielddayapp.ca/teams/t1', registerUrl: 'https://acme.fielddayapp.ca/register/fall-cup',
  }

  it('sends nothing when everyone is registered and the minimum is met', () => {
    expect(buildCaptainRegistrationReminderEmail({ ...d, minTeamSize: 4, readyCount: 6, needsWaiver: [], notRegistered: [] })).toBeNull()
  })

  it('still warns a fully registered team that is below the minimum', () => {
    const email = buildCaptainRegistrationReminderEmail({ ...d, minTeamSize: 6, readyCount: 4, needsWaiver: [], notRegistered: [] })
    expect(email?.subject).toBe('Spikers needs 2 more players ready for Fall Cup tomorrow')
  })

  it('keeps the old subject when only registrations are missing', () => {
    const email = buildCaptainRegistrationReminderEmail({ ...d, minTeamSize: 4, readyCount: 6, needsWaiver: [], notRegistered: ['Pat'] })
    expect(email?.subject).toBe('Reminder: 1 player still needs to register for Fall Cup')
    expect(email?.html).toContain('Pat')
  })
})
