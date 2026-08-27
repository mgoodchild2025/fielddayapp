import { describe, it, expect } from 'vitest'
import { eventDisplayPriceCents, formatEventPrice } from './event-price'

describe('eventDisplayPriceCents', () => {
  it('leads with the per-session fee for drop-in events', () => {
    expect(eventDisplayPriceCents({ price_cents: 12000, drop_in_price_cents: 1500, event_type: 'drop_in' })).toBe(1500)
  })

  it('falls back to the season price for drop-in events with no session fee', () => {
    expect(eventDisplayPriceCents({ price_cents: 12000, drop_in_price_cents: null, event_type: 'drop_in' })).toBe(12000)
  })

  it('shows the season price for regular events, drop-in fee as legacy fallback', () => {
    expect(eventDisplayPriceCents({ price_cents: 5000, drop_in_price_cents: 1500, event_type: 'league' })).toBe(5000)
    expect(eventDisplayPriceCents({ price_cents: 0, drop_in_price_cents: 1500, event_type: 'league' })).toBe(1500)
  })
})

describe('formatEventPrice', () => {
  it('labels a drop-in session price per session', () => {
    expect(formatEventPrice({ price_cents: 12000, drop_in_price_cents: 1500, event_type: 'drop_in', payment_mode: 'per_player', currency: 'cad' })).toBe('$15 CAD / session')
  })

  it('labels per-team and per-player prices', () => {
    expect(formatEventPrice({ price_cents: 40000, payment_mode: 'per_team', currency: 'cad' })).toBe('$400 CAD / team')
    expect(formatEventPrice({ price_cents: 5000, payment_mode: 'per_player', currency: 'cad' })).toBe('$50 CAD / player')
  })

  it('stays bare when the payment mode is unknown, and Free at zero', () => {
    expect(formatEventPrice({ price_cents: 5000, currency: 'cad' })).toBe('$50 CAD')
    expect(formatEventPrice({ price_cents: 0 })).toBe('Free')
  })
})
