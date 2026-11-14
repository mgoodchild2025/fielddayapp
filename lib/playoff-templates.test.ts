import { describe, it, expect } from 'vitest'
import { applicableTemplates, BUILTIN_TEMPLATES, describeTiers, firstRoundLosers, isLosersOnlyTier, tierSeedCount } from './playoff-templates'
import { validateInflowBracket } from './bracket'

function get(id: string) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id)!
}

describe('gold-silver-dropdown template', () => {
  it('produces the exact 10-team Gold/Silver scenario', () => {
    const tiers = get('gold-silver-dropdown').build(10)!
    expect(tiers).toHaveLength(2)
    expect(tiers[0]).toMatchObject({ name: 'Gold', seedFrom: 1, seedTo: 8, inflowFromTierIndex: null })
    expect(tiers[1]).toMatchObject({
      name: 'Silver', seedFrom: 9, seedTo: 10,
      inflowFromTierIndex: 0, byeSeeds: 2, // seeds 9-10 bye to the semis
    })
  })

  it('always yields a valid inflow layout when applicable', () => {
    for (let n = 2; n <= 40; n++) {
      const tiers = get('gold-silver-dropdown').build(n)
      if (!tiers) continue
      const [gold, silver] = tiers
      const goldTeams = gold.seedTo - gold.seedFrom + 1
      expect((goldTeams & (goldTeams - 1))).toBe(0) // gold is a full power-of-2 draw
      expect(
        validateInflowBracket({
          directSeeds: silver.seedTo - silver.seedFrom + 1,
          inflowCount: goldTeams / 2,
          byeSeeds: silver.byeSeeds,
        }),
      ).toBeNull()
      // Ranges tile the field exactly
      expect(gold.seedFrom).toBe(1)
      expect(silver.seedFrom).toBe(gold.seedTo + 1)
      expect(silver.seedTo).toBe(n)
    }
  })

  it('prefers byes for the direct seeds when the shape allows it', () => {
    // 12 teams: Gold 8 → 4 drop-downs, Silver 4 direct. byes=0 is the only
    // valid layout (entry 8 → main 4).
    const twelve = get('gold-silver-dropdown').build(12)!
    expect(twelve[1].byeSeeds).toBe(0)
    // 10 teams: byes=2 beats byes=0 (which would leave an odd entry round).
    const ten = get('gold-silver-dropdown').build(10)!
    expect(ten[1].byeSeeds).toBe(2)
  })
})

describe('split templates', () => {
  it('gold/silver split tiles the seeds with the larger half on top', () => {
    const tiers = get('gold-silver-split').build(9)!
    expect(tiers[0]).toMatchObject({ seedFrom: 1, seedTo: 5 })
    expect(tiers[1]).toMatchObject({ seedFrom: 6, seedTo: 9 })
  })

  it('three-way split covers every seed exactly once', () => {
    const tiers = get('gold-silver-bronze').build(11)!
    expect(tiers.map((t) => [t.seedFrom, t.seedTo])).toEqual([[1, 4], [5, 8], [9, 11]])
  })
})

describe('applicableTemplates', () => {
  it('only offers formats that lay out at the given count', () => {
    const forThree = applicableTemplates(3).map((a) => a.template.id)
    expect(forThree).toContain('single-bracket')
    expect(forThree).not.toContain('gold-silver-dropdown')
    expect(forThree).not.toContain('double-elim')

    const forTen = applicableTemplates(10).map((a) => a.template.id)
    expect(forTen).toContain('gold-silver-dropdown')
    expect(forTen).toContain('gold-silver-split')
  })
})

describe('describeTiers', () => {
  it('summarizes the 10-team drop-down layout', () => {
    const tiers = get('gold-silver-dropdown').build(10)!
    expect(describeTiers(tiers)).toBe('Gold 1–8 · Silver 9–10 (drop-downs in, 2 byes)')
  })
})

describe('championship-consolation template (losers-only tier)', () => {
  const t = get('championship-consolation')

  it('puts every team in the top tier and gives the second tier no seeds', () => {
    const tiers = t.build(8)!
    expect(tiers[0]).toMatchObject({ name: 'Championship', seedFrom: 1, seedTo: 8, inflowFromTierIndex: null })
    expect(tiers[1]).toMatchObject({ name: 'Consolation', seedFrom: 9, seedTo: 8, inflowFromTierIndex: 0, byeSeeds: 0 })
    expect(isLosersOnlyTier(tiers[1])).toBe(true)
    expect(tierSeedCount(tiers[1])).toBe(0)
    expect(isLosersOnlyTier(tiers[0])).toBe(false)
  })

  it('is offered only when the losers fill a bracket (2, 4, 8, … of them)', () => {
    const offered: number[] = []
    for (let n = 2; n <= 16; n++) if (t.build(n)) offered.push(n)
    // 5 teams → 1 loser, 7 → 3, 9 → 1, 11 → 3, 13 → 5, 14 → 6, 15 → 7
    expect(offered).toEqual([4, 6, 8, 10, 12, 16])
  })

  it('counts first-round losers, not byes', () => {
    expect(firstRoundLosers(8)).toBe(4)
    expect(firstRoundLosers(6)).toBe(2)  // seeds 1-2 bye
    expect(firstRoundLosers(12)).toBe(4) // seeds 1-4 bye
    expect(firstRoundLosers(1)).toBe(0)
    expect(firstRoundLosers(0)).toBe(0)
  })

  it('is described without a seed range', () => {
    expect(describeTiers(t.build(8)!)).toBe('Championship 1–8 · Consolation (first-round losers of Championship)')
  })
})
