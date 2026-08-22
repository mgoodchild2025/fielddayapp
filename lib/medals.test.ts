import { describe, it, expect } from 'vitest'
import { deriveLeagueMedals, type MedalMatchLite, type MedalTierLite } from './medals'

let mid = 0
function match(over: Partial<MedalMatchLite>): MedalMatchLite {
  return {
    id: `m${++mid}`, roundNumber: 1, matchNumber: 1,
    team1Id: null, team2Id: null, winnerTeamId: null,
    status: 'pending', isBye: false, medalMatch: null,
    ...over,
  }
}
function done(over: Partial<MedalMatchLite>): MedalMatchLite {
  return match({ status: 'completed', ...over })
}
function tier(name: string, matches: MedalMatchLite[], thirdPlaceGame = false): MedalTierLite {
  return { tierName: name, bracketId: `b-${name}`, thirdPlaceGame, matches }
}

const byPlacement = (medals: ReturnType<typeof deriveLeagueMedals>) =>
  Object.fromEntries(medals.map((m) => [m.placement === 'tier_champion' ? m.label : m.placement, m.teamId]))

describe('deriveLeagueMedals', () => {
  it('single elim: final decides gold/silver, third-place match decides bronze', () => {
    const final = done({ roundNumber: 1, matchNumber: 1, team1Id: 'A', team2Id: 'B', winnerTeamId: 'A' })
    const third = done({ roundNumber: 1, matchNumber: 2, team1Id: 'C', team2Id: 'D', winnerTeamId: 'D' })
    const m = byPlacement(deriveLeagueMedals([tier('Gold', [final, third], true)]))
    expect(m).toEqual({ gold: 'A', silver: 'B', bronze: 'D' })
  })

  it('single elim without third-place game awards no bronze', () => {
    const final = done({ team1Id: 'A', team2Id: 'B', winnerTeamId: 'B' })
    const medals = deriveLeagueMedals([tier('Gold', [final])])
    expect(byPlacement(medals)).toEqual({ gold: 'B', silver: 'A' })
  })

  it('double elim: grand final decides gold/silver, LB final loser takes bronze', () => {
    const gf = done({ roundNumber: 200, matchNumber: 1, team1Id: 'A', team2Id: 'B', winnerTeamId: 'A' })
    const lbFinal = done({ roundNumber: 104, matchNumber: 1, team1Id: 'B', team2Id: 'C', winnerTeamId: 'B' })
    const lbSemi = done({ roundNumber: 103, matchNumber: 1, team1Id: 'C', team2Id: 'D', winnerTeamId: 'C' })
    const m = byPlacement(deriveLeagueMedals([tier('Playoffs', [gf, lbFinal, lbSemi])]))
    expect(m).toEqual({ gold: 'A', silver: 'B', bronze: 'C' })
  })

  it('explicit medal matches beat shape conventions', () => {
    // Hand-built: the "final" by round convention is NOT the marked gold match
    const conventionFinal = done({ roundNumber: 1, matchNumber: 1, team1Id: 'X', team2Id: 'Y', winnerTeamId: 'X' })
    const goldMatch = done({ roundNumber: 2, matchNumber: 1, team1Id: 'A', team2Id: 'B', winnerTeamId: 'B', medalMatch: 'gold' })
    const bronzeMatch = done({ roundNumber: 2, matchNumber: 2, team1Id: 'C', team2Id: 'D', winnerTeamId: 'C', medalMatch: 'bronze' })
    const m = byPlacement(deriveLeagueMedals([tier('Custom', [conventionFinal, goldMatch, bronzeMatch])]))
    expect(m).toEqual({ gold: 'B', silver: 'A', bronze: 'C' })
  })

  it('lower tiers award "{Tier} Champion" to their winner only', () => {
    const goldFinal = done({ team1Id: 'A', team2Id: 'B', winnerTeamId: 'A' })
    const silverFinal = done({ team1Id: 'E', team2Id: 'F', winnerTeamId: 'F' })
    const medals = deriveLeagueMedals([tier('Gold', [goldFinal]), tier('Silver', [silverFinal])])
    expect(byPlacement(medals)).toEqual({ gold: 'A', silver: 'B', 'Silver Champion': 'F' })
  })

  it('awards nothing for an unfinished tier, but finished tiers still pay out', () => {
    const unfinishedFinal = match({ team1Id: 'A', team2Id: 'B', status: 'ready' })
    const silverFinal = done({ team1Id: 'E', team2Id: 'F', winnerTeamId: 'E' })
    const medals = deriveLeagueMedals([tier('Gold', [unfinishedFinal]), tier('Silver', [silverFinal])])
    expect(byPlacement(medals)).toEqual({ 'Silver Champion': 'E' })
  })

  it('a walkover-declared final (no scores) still awards — winner_team_id is the source', () => {
    const final = done({ team1Id: 'A', team2Id: 'B', winnerTeamId: 'A' })
    expect(byPlacement(deriveLeagueMedals([tier('Gold', [final])]))).toEqual({ gold: 'A', silver: 'B' })
  })

  it('a final decided against an empty slot awards gold but no silver', () => {
    const final = done({ team1Id: 'A', team2Id: null, winnerTeamId: 'A' })
    expect(byPlacement(deriveLeagueMedals([tier('Gold', [final])]))).toEqual({ gold: 'A' })
  })
})
