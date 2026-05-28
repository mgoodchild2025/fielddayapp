// ── Tournament Display Mode — shared types ───────────────────────────────────

export type LayoutId =
  | 'fullscreen'
  | 'split_h'
  | 'split_v'
  | 'main_sidebar'
  | 'sidebar_main'
  | 'thirds'
  | 'main_two_right'
  | 'four_quad'

export type ZoneConfig =
  | { type: 'schedule';  date_filter: 'today' | 'all'; pool_id?: string | null; court_filter?: string | null; scroll_speed?: 'slow' | 'normal' | 'fast' | null }
  | { type: 'standings'; pool_id?: string | null }
  | { type: 'bracket';  round_filter: 'all' | 'final' | 'semis' | 'quarters' | 'first' | 'last_2' | 'last_3'; tier_filter?: string | null }
  | { type: 'qr_code';  url: string; label: string }
  | { type: 'message';  title?: string; body: string; font_size: 'sm' | 'md' | 'lg' | 'xl' }
  | { type: 'clock' }
  | { type: 'logo' }
  | { type: 'empty' }

export interface DisplayConfig {
  layout:          LayoutId
  zones:           ZoneConfig[]
  theme:           'dark' | 'light'
  show_header:     boolean
  refresh_seconds: number
}

export const ZONE_COUNT: Record<LayoutId, number> = {
  fullscreen:     1,
  split_h:        2,
  split_v:        2,
  main_sidebar:   2,
  sidebar_main:   2,
  thirds:         3,
  main_two_right: 3,
  four_quad:      4,
}

export const ZONE_LABELS: Record<LayoutId, string[]> = {
  fullscreen:     ['A'],
  split_h:        ['Left', 'Right'],
  split_v:        ['Top', 'Bottom'],
  main_sidebar:   ['Main (large)', 'Sidebar'],
  sidebar_main:   ['Sidebar', 'Main (large)'],
  thirds:         ['Left', 'Center', 'Right'],
  main_two_right: ['Main (large)', 'Top Right', 'Bottom Right'],
  four_quad:      ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right'],
}

export function defaultConfig(): DisplayConfig {
  return {
    layout:          'split_h',
    zones:           [
      { type: 'schedule', date_filter: 'today', pool_id: null, court_filter: null },
      { type: 'standings', pool_id: null },
    ],
    theme:           'dark',
    show_header:     true,
    refresh_seconds: 30,
  }
}

export function blankZone(): ZoneConfig {
  return { type: 'empty' }
}

export function defaultBracketZone(): Extract<ZoneConfig, { type: 'bracket' }> {
  return { type: 'bracket', round_filter: 'all' }
}

// ── Data types returned by server actions ─────────────────────────────────────

export interface DisplayGame {
  id:              string
  scheduled_at:    string
  court:           string | null
  home_name:       string
  away_name:       string
  home_color:      string | null
  away_color:      string | null
  home_logo_url:   string | null
  away_logo_url:   string | null
  home_score:      number | null
  away_score:      number | null
  result_status:   'pending' | 'confirmed' | null
  game_status:     'scheduled' | 'cancelled' | 'postponed' | 'completed'
  pool_id:         string | null
}

export interface DisplayStanding {
  rank:     number
  team_id:  string
  name:     string
  color:    string | null
  pool_id:  string | null
  played:   number
  won:      number
  lost:     number
  drawn:    number
  pts:      number
  gf:       number
  ga:       number
}

export interface DisplayBracketMatch {
  id:            string
  round_number:  number
  match_number:  number
  team1_name:    string | null
  team2_name:    string | null
  score1:        number | null
  score2:        number | null
  winner_id:     string | null
  status:        string
  is_bye:        boolean
  scheduled_at:  string | null
  court:         string | null
}

export interface DisplayData {
  league:    { id: string; name: string; sport: string }
  org:       { name: string; logo_url: string | null }
  timezone:  string
  pools:     { id: string; name: string }[]
  games:     DisplayGame[]
  standings: DisplayStanding[]
  bracket:   { tiers: { name: string | null; matches: DisplayBracketMatch[] }[] } | null
}
