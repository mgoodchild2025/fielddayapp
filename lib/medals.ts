import { LB_ROUND_BASE, GF_ROUND } from '@/lib/bracket'

/**
 * Medal derivation (The Trophy Case).
 *
 * Pure: given a league's tiers and their bracket matches, decide which teams
 * earned which medals. The awarding action (actions/medals.ts) writes the
 * result down; nothing here touches the database.
 *
 * Rules:
 * - Explicit medal matches win: a match marked medal_match='gold' decides
 *   gold (winner) and silver (loser); 'bronze' decides bronze (winner).
 * - Otherwise the shape's convention decides: SE/all-play final (round 1,
 *   match 1) → gold/silver, third-place match (round 1, match 2) → bronze;
 *   double elim grand final (round ≥ 200) → gold/silver, LB final (highest
 *   round in [100, 200)) loser → bronze.
 * - The FIRST tier awards gold/silver/bronze. Every later tier awards its
 *   champion a 'tier_champion' medal ("Silver Champion") — a lower-bracket
 *   title is still a title.
 * - Only completed matches with a winner count. Ties in the data (missing
 *   winner) simply award nothing for that slot.
 */

export interface MedalMatchLite {
  id: string
  roundNumber: number
  matchNumber: number
  team1Id: string | null
  team2Id: string | null
  winnerTeamId: string | null
  status: string
  isBye: boolean
  medalMatch?: 'gold' | 'bronze' | null
}

export interface MedalTierLite {
  tierName: string
  bracketId: string
  thirdPlaceGame: boolean
  matches: MedalMatchLite[]
}

export interface DerivedMedal {
  placement: 'gold' | 'silver' | 'bronze' | 'tier_champion'
  label: string
  teamId: string
  bracketId: string
  decidingMatchId: string
}

function loserOf(m: MedalMatchLite): string | null {
  if (!m.winnerTeamId) return null
  const other = m.winnerTeamId === m.team1Id ? m.team2Id : m.team1Id
  return other ?? null
}

function isDecided(m: MedalMatchLite | undefined | null): m is MedalMatchLite {
  return !!m && m.status === 'completed' && !!m.winnerTeamId && !m.isBye
}

/** The match that decides a bracket's title, per shape convention. */
function findTitleMatch(matches: MedalMatchLite[]): MedalMatchLite | undefined {
  const explicit = matches.find((m) => m.medalMatch === 'gold')
  if (explicit) return explicit
  const gf = matches.find((m) => m.roundNumber >= GF_ROUND)
  if (gf) return gf
  return matches.find((m) => m.roundNumber === 1 && m.matchNumber === 1)
}

/** The match whose winner takes bronze, when the shape has one. */
function findBronzeMatch(matches: MedalMatchLite[], thirdPlaceGame: boolean): MedalMatchLite | undefined {
  const explicit = matches.find((m) => m.medalMatch === 'bronze')
  if (explicit) return explicit
  // Third-place match shares round 1 as its 2nd match (SE / all-play)
  if (thirdPlaceGame) {
    const third = matches.find((m) => m.roundNumber === 1 && m.matchNumber === 2)
    if (third) return third
  }
  return undefined
}

/** Double elim: bronze is the LB final's loser (no bronze match exists). */
function findLbFinal(matches: MedalMatchLite[]): MedalMatchLite | undefined {
  const lb = matches.filter((m) => m.roundNumber >= LB_ROUND_BASE && m.roundNumber < GF_ROUND)
  if (lb.length === 0) return undefined
  const maxRound = Math.max(...lb.map((m) => m.roundNumber))
  return lb.find((m) => m.roundNumber === maxRound && m.matchNumber === 1) ?? lb.find((m) => m.roundNumber === maxRound)
}

export function deriveLeagueMedals(tiers: MedalTierLite[]): DerivedMedal[] {
  const medals: DerivedMedal[] = []

  tiers.forEach((tier, index) => {
    const title = findTitleMatch(tier.matches)
    if (!isDecided(title)) return // tier not finished — award nothing for it

    if (index === 0) {
      // Top tier: the podium
      medals.push({ placement: 'gold', label: 'Champions', teamId: title.winnerTeamId!, bracketId: tier.bracketId, decidingMatchId: title.id })
      const silver = loserOf(title)
      if (silver) {
        medals.push({ placement: 'silver', label: 'Finalists', teamId: silver, bracketId: tier.bracketId, decidingMatchId: title.id })
      }

      const bronzeMatch = findBronzeMatch(tier.matches, tier.thirdPlaceGame)
      if (isDecided(bronzeMatch)) {
        medals.push({ placement: 'bronze', label: 'Third Place', teamId: bronzeMatch.winnerTeamId!, bracketId: tier.bracketId, decidingMatchId: bronzeMatch.id })
      } else {
        // Double elim: LB final loser is naturally 3rd
        const lbFinal = findLbFinal(tier.matches)
        if (isDecided(lbFinal)) {
          const bronze = loserOf(lbFinal)
          if (bronze) {
            medals.push({ placement: 'bronze', label: 'Third Place', teamId: bronze, bracketId: tier.bracketId, decidingMatchId: lbFinal.id })
          }
        }
      }
    } else {
      // Lower tiers: the champion still gets a title
      medals.push({
        placement: 'tier_champion',
        label: `${tier.tierName} Champion`,
        teamId: title.winnerTeamId!,
        bracketId: tier.bracketId,
        decidingMatchId: title.id,
      })
    }
  })

  return medals
}

/** Emoji + tint used everywhere a medal renders. */
export function medalGlyph(placement: DerivedMedal['placement']): string {
  switch (placement) {
    case 'gold': return '🥇'
    case 'silver': return '🥈'
    case 'bronze': return '🥉'
    case 'tier_champion': return '🏆'
  }
}
