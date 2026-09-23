import { describe, it, expect } from 'vitest'
import { rsvpAlertFor, rsvpRecipients, activeOrganizerIds, rsvpMessage, TEAM_MANAGER_ROLES } from './rsvp-notify'

describe('rsvpAlertFor', () => {
  it('raises "out" for a first out and for in → out', () => {
    expect(rsvpAlertFor(null, 'out')).toBe('out')
    expect(rsvpAlertFor(undefined, 'out')).toBe('out')
    expect(rsvpAlertFor('in', 'out')).toBe('out')
  })

  it('raises "back_in" when a player who said out changes to in', () => {
    expect(rsvpAlertFor('out', 'in')).toBe('back_in')
  })

  it('stays quiet for a first in — routine, not news', () => {
    expect(rsvpAlertFor(null, 'in')).toBeNull()
  })

  it('stays quiet for a repeat of the same answer, so a double tap never double-texts', () => {
    expect(rsvpAlertFor('out', 'out')).toBeNull()
    expect(rsvpAlertFor('in', 'in')).toBeNull()
  })
})

describe('TEAM_MANAGER_ROLES', () => {
  it('includes coaches, not just captains', () => {
    expect(TEAM_MANAGER_ROLES).toContain('captain')
    expect(TEAM_MANAGER_ROLES).toContain('coach')
  })
})

describe('rsvpRecipients', () => {
  it('sends to managers and the event organizers', () => {
    expect(rsvpRecipients({
      playerId: 'p', managerIds: ['cap', 'coach'], organizerIds: ['org1'], orgAdminIds: ['boss'],
    })).toEqual(['cap', 'coach', 'org1'])
  })

  it('does NOT ping org admins who do not organize this event', () => {
    const r = rsvpRecipients({ playerId: 'p', managerIds: ['cap'], organizerIds: ['org1'], orgAdminIds: ['boss', 'other'] })
    expect(r).not.toContain('boss')
    expect(r).not.toContain('other')
  })

  it('falls back to org admins when the event has no organizer, so nothing is dropped', () => {
    expect(rsvpRecipients({ playerId: 'p', managerIds: [], organizerIds: [], orgAdminIds: ['boss'] })).toEqual(['boss'])
  })

  it('never notifies the player about their own RSVP, even if they are a manager', () => {
    const r = rsvpRecipients({ playerId: 'cap', managerIds: ['cap', 'coach'], organizerIds: ['cap'], orgAdminIds: [] })
    expect(r).toEqual(['coach'])
  })

  it('deduplicates someone who is both a manager and an organizer', () => {
    expect(rsvpRecipients({ playerId: 'p', managerIds: ['x'], organizerIds: ['x'], orgAdminIds: [] })).toEqual(['x'])
  })
})

describe('activeOrganizerIds', () => {
  it('drops organizer rows for people who are no longer active admins', () => {
    expect(activeOrganizerIds(['a', 'gone', null], new Set(['a']))).toEqual(['a'])
  })
})

describe('rsvpMessage', () => {
  const ctx = { playerName: 'Sam', teamName: 'Spikers', opponent: 'Blockers', date: 'Tue Sep 22', time: '7:30 PM', court: 'Court 2' }

  it('describes an out RSVP', () => {
    const m = rsvpMessage('out', ctx)
    expect(m.title).toBe('Sam is out')
    expect(m.body).toBe("Sam has RSVP'd out for Spikers vs Blockers on Tue Sep 22 at 7:30 PM · Court 2.")
  })

  it('describes a player coming back in', () => {
    const m = rsvpMessage('back_in', ctx)
    expect(m.title).toBe('Sam is back in')
    expect(m.body).toBe('Sam is back in for Spikers vs Blockers on Tue Sep 22 at 7:30 PM · Court 2.')
  })

  it('reads cleanly with no opponent or court', () => {
    const m = rsvpMessage('out', { ...ctx, opponent: null, court: null })
    expect(m.body).toBe("Sam has RSVP'd out for Spikers on Tue Sep 22 at 7:30 PM.")
  })
})
