import { describe, it, expect } from 'vitest'
import { decideReminderChannels } from './reminder-channels'

const optedIn = { phone: '+14165551234', smsOptedIn: true, pushRemindersEnabled: true, smsAlsoWhenPush: false }
const base = { orgSmsEnabled: true, pushConfigured: true, hasPushSubscription: false }

describe('decideReminderChannels', () => {
  it('keeps SMS exactly as before for a player with no push subscription', () => {
    expect(decideReminderChannels(optedIn, base)).toEqual({ push: true, sms: true, smsSkip: null })
  })

  it('skips the text when the player can receive push for this org', () => {
    expect(decideReminderChannels(optedIn, { ...base, hasPushSubscription: true }))
      .toEqual({ push: true, sms: false, smsSkip: 'push_instead' })
  })

  it('still texts when the player asked to keep texts alongside push', () => {
    expect(decideReminderChannels({ ...optedIn, smsAlsoWhenPush: true }, { ...base, hasPushSubscription: true }))
      .toEqual({ push: true, sms: true, smsSkip: null })
  })

  it('never trades SMS for push the server cannot deliver', () => {
    expect(decideReminderChannels(optedIn, { ...base, hasPushSubscription: true, pushConfigured: false }).sms).toBe(true)
  })

  it('never trades SMS for push the player turned off', () => {
    const r = decideReminderChannels({ ...optedIn, pushRemindersEnabled: false }, { ...base, hasPushSubscription: true })
    expect(r).toEqual({ push: false, sms: true, smsSkip: null })
  })

  it('honours the existing SMS gates in order', () => {
    expect(decideReminderChannels(optedIn, { ...base, orgSmsEnabled: false }).smsSkip).toBe('org_disabled')
    expect(decideReminderChannels({ ...optedIn, phone: null }, base).smsSkip).toBe('no_phone')
    expect(decideReminderChannels({ ...optedIn, smsOptedIn: false }, base).smsSkip).toBe('not_opted_in')
    expect(decideReminderChannels(optedIn, { ...base, smsKindEnabled: false }).smsSkip).toBe('kind_disabled')
  })

  it('treats a missing push preference as on (column default)', () => {
    expect(decideReminderChannels({ ...optedIn, pushRemindersEnabled: null }, base).push).toBe(true)
  })
})
