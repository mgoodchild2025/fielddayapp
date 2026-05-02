export type ScoreStructure =
  | { type: 'sets';    count: number }
  | { type: 'periods'; labels: string[] }
  | { type: 'halves';  labels: string[] }
  | { type: 'innings'; count: number }
  | { type: 'final' }

export function getScoreStructure(sport: string): ScoreStructure {
  switch (sport) {
    case 'volleyball':       return { type: 'sets',    count: 5 }
    case 'beach_volleyball': return { type: 'sets',    count: 3 }
    case 'basketball':       return { type: 'periods', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'] }
    case 'hockey':           return { type: 'periods', labels: ['P1', 'P2', 'P3', 'OT'] }
    case 'soccer':           return { type: 'halves',  labels: ['1st Half', '2nd Half', 'ET', 'PK'] }
    case 'rugby':            return { type: 'halves',  labels: ['1st Half', '2nd Half', 'ET'] }
    case 'flag_football':
    case 'football':         return { type: 'periods', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'] }
    case 'baseball':         return { type: 'innings', count: 9 }
    case 'softball':         return { type: 'innings', count: 7 }
    default:                 return { type: 'final' }
  }
}
