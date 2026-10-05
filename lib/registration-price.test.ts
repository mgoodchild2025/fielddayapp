import { describe, it, expect } from 'vitest'
import { teamFeeCents } from './registration-price'

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

describe('teamFeeCents', () => {
  it('charges the early-bird price before the deadline', () => {
    expect(teamFeeCents({ price_cents: 50000, early_bird_price_cents: 42500, early_bird_deadline: future })).toBe(42500)
  })
  it('charges the full price once the deadline has passed', () => {
    expect(teamFeeCents({ price_cents: 50000, early_bird_price_cents: 42500, early_bird_deadline: past })).toBe(50000)
  })
  it('ignores an early-bird price without a deadline (and vice versa)', () => {
    expect(teamFeeCents({ price_cents: 50000, early_bird_price_cents: 42500, early_bird_deadline: null })).toBe(50000)
    expect(teamFeeCents({ price_cents: 50000, early_bird_price_cents: null, early_bird_deadline: future })).toBe(50000)
  })
  it('treats a missing price as free', () => {
    expect(teamFeeCents({ price_cents: null })).toBe(0)
  })
})
