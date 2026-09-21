import { describe, it, expect } from 'vitest'
import { indexTeamPayments, isPaidStatus, teamHasPaid } from './team-payments'

describe('isPaidStatus', () => {
  it('counts an admin-acknowledged offline payment as settled', () => {
    expect(isPaidStatus('paid')).toBe(true)
    expect(isPaidStatus('manual')).toBe(true)
    expect(isPaidStatus('pending')).toBe(false)
    expect(isPaidStatus('refunded')).toBe(false)
    expect(isPaidStatus(null)).toBe(false)
  })
})

describe('indexTeamPayments', () => {
  it('a paid row wins over a pending one for the same team', () => {
    const map = indexTeamPayments([
      { team_id: 't1', status: 'pending', amount_cents: 20000, currency: 'cad' },
      { team_id: 't1', status: 'paid', amount_cents: 20000, currency: 'cad' },
    ])
    expect(map.get('t1')?.state).toBe('paid')
    expect(teamHasPaid(map.get('t1'))).toBe(true)
  })

  it('keeps a pending team pending and carries the amount for the badge', () => {
    const map = indexTeamPayments([{ team_id: 't2', status: 'pending', amount_cents: 15000, currency: 'usd' }])
    expect(map.get('t2')).toEqual({ state: 'pending', amountCents: 15000, currency: 'usd' })
    expect(teamHasPaid(map.get('t2'))).toBe(false)
  })

  it('ignores rows with no team and reports unknown teams as unpaid', () => {
    const map = indexTeamPayments([{ team_id: null, status: 'paid' }])
    expect(map.size).toBe(0)
    expect(teamHasPaid(map.get('nope'))).toBe(false)
  })

  it('a refunded team fee is not paid', () => {
    const map = indexTeamPayments([{ team_id: 't3', status: 'refunded', amount_cents: 20000, currency: 'cad' }])
    expect(map.get('t3')?.state).toBe('none')
    expect(teamHasPaid(map.get('t3'))).toBe(false)
  })
})
