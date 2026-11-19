import { describe, expect, it } from 'vitest'
import { normalizeTeamName, findTeamByName } from './team-name-match'

describe('normalizeTeamName', () => {
  it('treats curly and straight apostrophes, spaces and case alike', () => {
    expect(normalizeTeamName(' Hits  Don’t Lie ')).toBe(normalizeTeamName("hits don't lie"))
    expect(normalizeTeamName('Block‑Party')).toBe(normalizeTeamName('block-party'))
    expect(normalizeTeamName('“Ace” Squad')).toBe(normalizeTeamName('"ace" squad'))
    expect(normalizeTeamName(null)).toBe('')
  })
})

describe('findTeamByName', () => {
  const teams = [
    { id: '1', name: "Hits Don't Lie" },
    { id: '2', name: 'Net Results' },
    { id: '3', name: 'Twins' },
    { id: '4', name: 'twins ' },
  ]
  it('matches a CSV name typed with a curly apostrophe', () => {
    expect(findTeamByName('Hits Don’t Lie', teams)?.id).toBe('1')
    expect(findTeamByName('net results', teams)?.id).toBe('2')
  })
  it('refuses to guess between two teams with the same name, or none', () => {
    expect(findTeamByName('Twins', teams)).toBeNull()
    expect(findTeamByName('Team 7', teams)).toBeNull()
    expect(findTeamByName('  ', teams)).toBeNull()
  })
})
