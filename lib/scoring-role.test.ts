import { describe, expect, it } from 'vitest'
import { canClearScores, decideScoringRole } from './scoring-role'

const base = { orgRole: null, organizerOfEvent: false, scorekeeperOfEvent: false, hasEvent: true }

describe('decideScoringRole', () => {
  it('org admins score every event, even games with no event', () => {
    expect(decideScoringRole({ ...base, orgRole: 'org_admin' })).toBe('admin')
    expect(decideScoringRole({ ...base, orgRole: 'org_admin', hasEvent: false })).toBe('admin')
  })

  it('league admins score only the events they organise', () => {
    expect(decideScoringRole({ ...base, orgRole: 'league_admin', organizerOfEvent: true })).toBe('admin')
    expect(decideScoringRole({ ...base, orgRole: 'league_admin' })).toBeNull()
    expect(decideScoringRole({ ...base, orgRole: 'league_admin', organizerOfEvent: true, hasEvent: false })).toBeNull()
  })

  it('an organizer row without the league admin role is not enough', () => {
    expect(decideScoringRole({ ...base, orgRole: 'player', organizerOfEvent: true })).toBeNull()
  })

  it('scorekeepers score their event only, whatever their org role', () => {
    expect(decideScoringRole({ ...base, scorekeeperOfEvent: true })).toBe('scorekeeper')
    expect(decideScoringRole({ ...base, orgRole: 'player', scorekeeperOfEvent: true })).toBe('scorekeeper')
    expect(decideScoringRole({ ...base, orgRole: 'league_admin', scorekeeperOfEvent: true })).toBe('scorekeeper')
    expect(decideScoringRole({ ...base, scorekeeperOfEvent: true, hasEvent: false })).toBeNull()
  })

  it('everyone else gets nothing', () => {
    expect(decideScoringRole(base)).toBeNull()
    expect(decideScoringRole({ ...base, orgRole: 'captain' })).toBeNull()
  })
})

describe('canClearScores', () => {
  it('is for admins only', () => {
    expect(canClearScores('admin')).toBe(true)
    expect(canClearScores('scorekeeper')).toBe(false)
    expect(canClearScores(null)).toBe(false)
  })
})
