import { describe, expect, it } from 'vitest'
import { alertHeadline, dueRenotifyStage, isLiveRing, LIVE_RING_MAX_AGE_MS, ringRefusal } from './logic'

describe('dueRenotifyStage', () => {
  const t0 = 1_000_000
  it('is nothing before 60 s', () => {
    expect(dueRenotifyStage(t0, 0, t0 + 59_999)).toBeNull()
  })
  it('is stage 1 at 60 s, once', () => {
    expect(dueRenotifyStage(t0, 0, t0 + 60_000)).toBe(1)
    expect(dueRenotifyStage(t0, 1, t0 + 90_000)).toBeNull()
  })
  it('is stage 2 at 120 s, then stops', () => {
    expect(dueRenotifyStage(t0, 1, t0 + 120_000)).toBe(2)
    expect(dueRenotifyStage(t0, 2, t0 + 600_000)).toBeNull()
  })
  it('catches up with a single push when both stages are overdue', () => {
    expect(dueRenotifyStage(t0, 0, t0 + 300_000)).toBe(2)
  })
})

describe('isLiveRing', () => {
  const now = Date.parse('2026-10-11T20:00:00Z')
  it('is live while unacknowledged and recent', () => {
    expect(isLiveRing({ created_at: new Date(now - 5_000).toISOString(), acknowledged_at: null }, now)).toBe(true)
  })
  it('is not live once acknowledged', () => {
    expect(isLiveRing({ created_at: new Date(now - 5_000).toISOString(), acknowledged_at: new Date(now).toISOString() }, now)).toBe(false)
  })
  it('stops alerting after 15 minutes', () => {
    expect(LIVE_RING_MAX_AGE_MS).toBe(15 * 60_000)
    expect(isLiveRing({ created_at: new Date(now - 14 * 60_000).toISOString(), acknowledged_at: null }, now)).toBe(true)
    expect(isLiveRing({ created_at: new Date(now - 15 * 60_000).toISOString(), acknowledged_at: null }, now)).toBe(false)
  })
  it('expires after the max age', () => {
    expect(isLiveRing({ created_at: new Date(now - LIVE_RING_MAX_AGE_MS).toISOString(), acknowledged_at: null }, now)).toBe(false)
  })
})

describe('ringRefusal', () => {
  it('maps disarmed to 409 with the fallback message', () => {
    expect(ringRefusal('disarmed', 0, 'Call 555-0100')).toEqual({ status: 409, body: { error: 'disarmed', fallbackMessage: 'Call 555-0100' } })
  })
  it('maps both limits to 429 with retryAfter of at least 1', () => {
    expect(ringRefusal('cooldown', 30, null)).toEqual({ status: 429, body: { error: 'cooldown', retryAfter: 30 } })
    expect(ringRefusal('station_limit', 0, null).body.retryAfter).toBe(1)
  })
  it('maps not_found to 404', () => {
    expect(ringRefusal('not_found', 0, null).status).toBe(404)
  })
})

describe('alertHeadline', () => {
  it('names one visitor, counts several', () => {
    expect(alertHeadline(['Danny'])).toBe('Danny is at the door')
    expect(alertHeadline([null])).toBe('Someone is at the door')
    expect(alertHeadline(['Danny', null])).toBe('2 people at the door')
    expect(alertHeadline([])).toBe('')
  })
})
