// Content for the apex-only marketing landing pages: competitor comparisons
// (/compare/[slug]) and sport pages (/leagues/[sport]). Kept as plain data so
// the sitemap route and both page templates share one source of truth.
//
// Competitor claims here are limited to publicly available information
// (pricing model, target market) verified Aug 2026 — each page carries a
// "verify with the vendor" disclaimer. Keep it that way: never assert a
// specific competitor price or the absence of a competitor feature.

export type ComparisonPage = {
  slug: string
  competitor: string
  metaTitle: string
  metaDescription: string
  heroTagline: string
  /** Quotable plain-prose summary — written for AI answer engines. */
  shortVersion: string
  chooseFieldday: string[]
  chooseThem: string[]
  rows: Array<{ dim: string; fieldday: string; them: string }>
  faqs: Array<{ q: string; a: string }>
}

export const COMPARISONS: ComparisonPage[] = [
  {
    slug: 'teamsnap',
    competitor: 'TeamSnap',
    metaTitle: 'Fieldday vs TeamSnap — League Management Comparison',
    metaDescription:
      'TeamSnap grew up around teams; Fieldday is built for the person running the whole league. Compare pricing models, Canadian payments, playoffs, and league websites.',
    heroTagline:
      'TeamSnap grew up around teams — rosters, carpools, and parent chat. Fieldday is built for the person running the whole league.',
    shortVersion:
      'TeamSnap is best known as a team management app for coaches and parents, with a separate organization-level product (TeamSnap for Business) priced by organization size through a sales conversation. Fieldday is league-operator software with flat, self-serve monthly pricing in Canadian dollars: registration, Stripe and e-transfer payments with GST/HST handling, scheduling, standings, tiered playoffs, and a branded public website for every league.',
    chooseFieldday: [
      'You run a league or club and want one flat monthly price you can start on today — no sales call',
      'Your players pay by e-transfer or cash as often as by card, and you need GST/PST/HST handled',
      'You want a public league website — standings, schedules, galleries, Hall of Champions — not just an app',
      'You run adult rec sports and want playoffs, medals, player cards, and gym TV displays',
    ],
    chooseThem: [
      'You manage a single team and mainly need rosters, availability, and parent communication',
      'Your organization already lives in the TeamSnap app ecosystem',
      'You want a large, long-established vendor with a big mobile install base',
    ],
    rows: [
      { dim: 'Built for', fieldday: 'League and club operators — adult rec and community sports', them: 'Teams first (coaches and parents); org product for clubs and leagues' },
      { dim: 'Pricing model', fieldday: 'Flat monthly plans from $0 to $179 CAD, self-serve, 15-day free trial', them: 'League/club product is quote-based by organization size, via sales' },
      { dim: 'Registration fees', fieldday: 'No platform percentage — you pay only Stripe’s standard processing fees', them: 'Varies by product and plan — confirm with TeamSnap' },
      { dim: 'Canadian payments', fieldday: 'E-transfer and cash tracking built in; GST/PST/HST on every charge and report', them: 'Card-based online payments — confirm tax and e-transfer handling with TeamSnap' },
      { dim: 'League website', fieldday: 'Branded public site per league: schedule, standings, gallery, Hall of Champions', them: 'Organization pages within the TeamSnap ecosystem' },
      { dim: 'Game night', fieldday: 'Courtside phone score entry, captain score confirmation, gym TV displays', them: 'Score and schedule tracking in the team app' },
    ],
    faqs: [
      {
        q: 'Is Fieldday a good TeamSnap alternative for leagues in Canada?',
        a: 'Yes — Fieldday is built in Canada for league operators: flat CAD pricing, e-transfer and cash tracking alongside Stripe, GST/PST/HST on every charge, and financial reports with a tax remittance line.',
      },
      {
        q: 'Can I switch mid-season?',
        a: 'You can set up leagues, teams, and schedules in an afternoon, and import schedules by CSV on the Club plan. Standings build from the games you record going forward.',
      },
      {
        q: 'Does Fieldday have a mobile app like TeamSnap?',
        a: 'Fieldday runs in the browser on any phone and installs to the home screen under your league’s own name and icon — players get schedules, standings, scores, and payments without downloading anything from an app store.',
      },
    ],
  },
  {
    slug: 'leagueapps',
    competitor: 'LeagueApps',
    metaTitle: 'Fieldday vs LeagueApps — League Management Comparison',
    metaDescription:
      'LeagueApps charges a percentage of every transaction; Fieldday is a flat monthly price with no platform fees. Compare pricing, Canadian payments, and league features.',
    heroTagline:
      'LeagueApps takes a percentage of every registration. Fieldday is a flat monthly price — your registration revenue stays yours.',
    shortVersion:
      'LeagueApps is a youth-sports-focused platform priced as a percentage of each payment transaction plus a setup fee, with quote-based onboarding through a sales team. Fieldday is self-serve league software with flat monthly pricing in Canadian dollars and no platform percentage on registrations — leagues pay only Stripe’s standard processing fees — plus e-transfer and cash tracking, GST/HST handling, tiered playoffs, and a branded website per league.',
    chooseFieldday: [
      'You want predictable software costs — a flat monthly price instead of a cut of every registration',
      'You run adult rec or community leagues rather than a large youth sports program',
      'Your players pay by e-transfer or cash as often as by card, and GST/PST/HST matters',
      'You want to sign up and launch today without a sales call or setup engagement',
    ],
    chooseThem: [
      'You run a large youth sports organization and want a vendor with onboarding services',
      'You prefer costs that scale with transaction volume instead of a subscription',
      'You need US-market youth-sports integrations LeagueApps specializes in',
    ],
    rows: [
      { dim: 'Built for', fieldday: 'Adult rec and community leagues, clubs, and tournaments', them: 'Youth sports organizations, primarily US' },
      { dim: 'Pricing model', fieldday: 'Flat monthly plans from $0 to $179 CAD, self-serve, 15-day free trial', them: 'Percentage of each transaction plus setup fee; quote-based' },
      { dim: 'Registration fees', fieldday: 'No platform percentage — you pay only Stripe’s standard processing fees', them: 'Platform fee is a share of each payment — confirm current rates with LeagueApps' },
      { dim: 'Canadian payments', fieldday: 'E-transfer and cash tracking built in; GST/PST/HST on every charge and report', them: 'Online payments platform — confirm Canadian tax handling with LeagueApps' },
      { dim: 'Getting started', fieldday: 'Self-serve — create your org and open registration the same day', them: 'Sales conversation and onboarding process' },
      { dim: 'Game night', fieldday: 'Courtside phone score entry, tiered playoffs, medals, gym TV displays', them: 'Scheduling and program management tools' },
    ],
    faqs: [
      {
        q: 'How much does Fieldday cost compared to LeagueApps?',
        a: 'Fieldday is a flat monthly subscription — free for one league up to 50 players, then $39, $89, or $179 CAD per month — with no percentage taken from registrations. LeagueApps prices as a share of each transaction plus a setup fee, quoted by their sales team, so the comparison depends on your payment volume.',
      },
      {
        q: 'Does Fieldday take a cut of registration payments?',
        a: 'No. Fieldday adds no platform fee on top of Stripe’s standard card processing fees, and e-transfer or cash payments recorded in Fieldday carry no processing cost at all.',
      },
      {
        q: 'Is Fieldday only for adult leagues?',
        a: 'No — it runs leagues, tournaments, and drop-in programs for any age group, with digital waivers and emergency contact collection. Its design centre of gravity is community and adult rec sports rather than large youth club operations.',
      },
    ],
  },
  {
    slug: 'teamlinkt',
    competitor: 'TeamLinkt',
    metaTitle: 'Fieldday vs TeamLinkt — League Management Comparison',
    metaDescription:
      'Two Canadian platforms, two models: TeamLinkt is free and funded by payment fees and in-app ads; Fieldday is a flat subscription with no ads and a branded website per league.',
    heroTagline:
      'Two Canadian platforms, two models: TeamLinkt is free, funded by payment fees and in-app advertising. Fieldday is a paid subscription — no ads, and every league gets its own branded website.',
    shortVersion:
      'TeamLinkt is a Canadian sports management platform offered free, with revenue from a share of payment processing and advertising inside its app. Fieldday is also Canadian but takes the opposite model: a flat monthly subscription with no advertising, no platform percentage on registrations beyond Stripe’s standard fees, and a branded public website for every league — plus e-transfer and cash tracking, GST/HST handling, tiered playoffs, medals, player cards, and gym TV displays.',
    chooseFieldday: [
      'You want your league presented under your own brand — your site, your colours, no third-party ads',
      'You want game-night extras: tiered playoffs, medals, a Hall of Champions, player cards, gym TVs',
      'You track e-transfer and cash payments and need GST/PST/HST on charges and reports',
      'You want financial tools — per-event P&L, expense receipts, and tax-ready reports',
    ],
    chooseThem: [
      'A $0 software budget is the deciding factor',
      'You’re comfortable with advertising in your players’ app experience',
      'You mainly need core team management and communication',
    ],
    rows: [
      { dim: 'Built for', fieldday: 'Community leagues and clubs that want their own branded presence', them: 'Leagues, clubs, and associations wanting a free platform' },
      { dim: 'Pricing model', fieldday: 'Flat monthly plans from $0 to $179 CAD — software is the product', them: 'Free — revenue from a share of payment fees and in-app advertising' },
      { dim: 'Advertising', fieldday: 'None, on any plan', them: 'Ads shown in the free app experience' },
      { dim: 'League website', fieldday: 'Branded public site per league: schedule, standings, gallery, Hall of Champions', them: 'League pages within the TeamLinkt platform' },
      { dim: 'Canadian payments', fieldday: 'Stripe plus e-transfer and cash tracking; GST/PST/HST everywhere money moves', them: 'Online payments through the platform — confirm current fee share with TeamLinkt' },
      { dim: 'Game night', fieldday: 'Courtside phone score entry, tiered playoffs, medals, player cards, TV displays', them: 'Scheduling, scores, and team communication' },
    ],
    faqs: [
      {
        q: 'Why pay for Fieldday when TeamLinkt is free?',
        a: 'Free platforms earn revenue somewhere — TeamLinkt’s model is a share of payment processing plus advertising in the app. With Fieldday the subscription is the whole business model: no ads, no platform percentage on registrations, and the product roadmap answers to leagues, not advertisers.',
      },
      {
        q: 'Are both platforms Canadian?',
        a: 'Yes. TeamLinkt is based in Saskatoon; Fieldday is Canadian too, with CAD pricing, e-transfer and cash payment tracking, and GST/PST/HST handling built into every charge and financial report.',
      },
      {
        q: 'What does Fieldday offer that a free platform typically doesn’t?',
        a: 'A branded public website per league, tiered playoff brackets with medals and a Hall of Champions, flippable player trading cards, gym TV displays, courtside score entry, and financial tools with tax-ready reporting.',
      },
    ],
  },
]

// ── Sport landing pages ───────────────────────────────────────────────────────

export type SportPage = {
  slug: string
  sport: string
  metaTitle: string
  metaDescription: string
  h1: string
  heroTagline: string
  shortVersion: string
  highlights: Array<{ title: string; desc: string }>
  faqs: Array<{ q: string; a: string }>
}

export const SPORT_PAGES: SportPage[] = [
  {
    slug: 'volleyball',
    sport: 'Volleyball',
    metaTitle: 'Volleyball League Management Software — Fieldday',
    metaDescription:
      'Run indoor and beach volleyball leagues: set-by-set scores, set-ratio standings, tiered Gold/Silver playoffs, drop-in nights, season passes, and e-transfer payments.',
    h1: 'Volleyball league management software',
    heroTagline:
      'Set-by-set scores, standings by set ratio, tiered Gold and Silver playoffs, and drop-in nights that fill themselves — indoor and beach.',
    shortVersion:
      'Fieldday is volleyball league management software for community leagues and clubs. It records scores set by set, ranks standings by wins, set wins, set differential, or total points, generates tiered playoff brackets (Gold/Silver) with cross-tier drop-downs, and runs drop-in nights and season passes with online, e-transfer, or cash payment — for indoor and beach volleyball.',
    highlights: [
      { title: 'Set-by-set scoring', desc: 'Captains or courtside admins enter each set. Standings can rank by match wins, set wins, set differential, or total points — your league, your tiebreak rules.' },
      { title: 'Tiered Gold/Silver playoffs', desc: 'Generate playoff brackets straight from standings. Top seeds fight for Gold while first-round losers can drop into the Silver bracket — everyone keeps playing.' },
      { title: 'Drop-in nights & season passes', desc: 'Sell per-session spots, season passes, or both. Mid-season passes prorate automatically to the sessions remaining.' },
      { title: 'Courtside score entry', desc: 'A score screen built for a phone in a loud gym: the night’s games as cards, big inputs, scores saved between matches — no laptop needed.' },
      { title: 'Beach and indoor', desc: 'Run 6s indoors all winter and 4s on sand all summer under one organization, one website, one payment setup.' },
      { title: 'Medals & the Hall of Champions', desc: 'Champions earn permanent medals, podiums, and banners on a public Hall of Champions — the page your players check all off-season.' },
    ],
    faqs: [
      {
        q: 'Can standings rank by set ratio instead of match wins?',
        a: 'Yes — each league chooses its standings method: match wins, set wins, set differential, or total points scored. Set-level results are recorded with every game.',
      },
      {
        q: 'Does Fieldday work for beach volleyball?',
        a: 'Yes. Indoor and beach leagues run side by side in one organization — different formats, schedules, and prices, one branded website and one place to pay.',
      },
      {
        q: 'How do drop-in volleyball nights work?',
        a: 'Publish the sessions, set a price and capacity, and players grab spots online — paying by card, e-transfer, or cash. Season passes can cover every session, prorated if bought mid-season.',
      },
    ],
  },
  {
    slug: 'soccer',
    sport: 'Soccer',
    metaTitle: 'Soccer League Management Software — Fieldday',
    metaDescription:
      'Run adult rec soccer leagues: team registration with captain invites, field scheduling, live standings, playoff brackets, digital waivers, and e-transfer payments.',
    h1: 'Soccer league management software',
    heroTagline:
      'Team registration with captain invites, field-by-field scheduling, live standings, and playoffs — without the group-chat chaos.',
    shortVersion:
      'Fieldday is soccer league management software for adult rec and community leagues. Captains register teams and invite their roster, admins schedule matches across fields week by week, captains submit scores that opponents confirm, standings update live, and playoff brackets generate straight from the table — with payments by card, e-transfer, or cash, and GST/HST handled.',
    highlights: [
      { title: 'Team registration, captain-led', desc: 'Captains register and pay per team, then invite players by link. Rosters fill themselves, waivers get signed digitally, and you can see who’s missing at a glance.' },
      { title: 'Field scheduling', desc: 'Generate week-by-week fixtures across your fields and time slots in minutes, then cancel, postpone, or restore matches with both teams notified automatically.' },
      { title: 'Scores captains agree on', desc: 'One captain submits the final score, the opposing captain confirms it, and the table updates instantly — no more disputed results in a group chat.' },
      { title: 'Playoffs & finals day', desc: 'Single or double elimination generated from the standings, tiered brackets so every team gets a playoff run, and medals awarded to the champions.' },
      { title: 'Pay the way your league pays', desc: 'Stripe checkout, e-transfer, or cash — every payment tracked per team with outstanding balances visible, and GST/PST/HST on every charge.' },
      { title: 'A real league website', desc: 'Fixtures, tables, galleries, and a Hall of Champions on your own branded site — the link you put on the back of the jerseys.' },
    ],
    faqs: [
      {
        q: 'Can captains pay the team fee and collect from players themselves?',
        a: 'Yes — leagues can charge per team or per player. Per-team leagues show one team fee, payable online or recorded as e-transfer or cash, with the balance visible to the captain.',
      },
      {
        q: 'What happens when a match is rained out?',
        a: 'Postpone it from the schedule with one click — both teams get an in-app notification and email, the public schedule shows the postponement, and you can restore or reschedule it later.',
      },
      {
        q: 'Does Fieldday handle waivers for contact sports?',
        a: 'Yes — digital waivers are signed during registration (or by QR code at the field), tracked per player, with admins alerted to unsigned waivers on active rosters.',
      },
    ],
  },
  {
    slug: 'basketball',
    sport: 'Basketball',
    metaTitle: 'Basketball League Management Software — Fieldday',
    metaDescription:
      'Run basketball leagues and drop-in runs: court scheduling, live standings with streaks, player stats and leaderboards, playoff brackets, and e-transfer payments.',
    h1: 'Basketball league management software',
    heroTagline:
      'Court scheduling, standings with win streaks, player stats and leaderboards, and playoff brackets that build themselves.',
    shortVersion:
      'Fieldday is basketball league management software for community leagues and drop-in runs. It schedules games across courts, tracks live standings with win streaks, records per-game player stats with season leaderboards, generates playoff brackets from the standings, and takes payments by card, e-transfer, or cash with GST/HST handled.',
    highlights: [
      { title: 'Court scheduling', desc: 'Generate a season of games across your courts and time slots in minutes — then manage cancellations and reschedules with automatic team notifications.' },
      { title: 'Player stats & leaderboards', desc: 'Record per-game stats and publish season leaderboards. Every player gets a flippable trading card with their career numbers on the back.' },
      { title: 'Standings with streaks', desc: 'Captains submit, opponents confirm, the table updates live — with win-streak chips your players will screenshot.' },
      { title: 'Drop-in runs', desc: 'Sell spots to open runs per session or by season pass, with capacity caps, QR check-in, and prorated mid-season pass pricing.' },
      { title: 'Playoffs & medals', desc: 'Brackets generate straight from the standings — tiered divisions, single or double elimination — and champions land on a permanent Hall of Champions.' },
      { title: 'Gym TV displays', desc: 'Put live scoreboards, player cards, and photo walls on the gym TV. Game night looks like an event, not a spreadsheet.' },
    ],
    faqs: [
      {
        q: 'Can Fieldday track player stats for basketball?',
        a: 'Yes — per-game player stats with season leaderboards on Pro and Club plans, and career totals on each player’s trading card.',
      },
      {
        q: 'Does it work for drop-in runs, not just leagues?',
        a: 'Yes — publish sessions with a price and a cap, let players grab spots online, and check them in by QR at the door. Season passes cover every session at a prorated price mid-season.',
      },
      {
        q: 'How do players see the schedule and standings?',
        a: 'On your league’s own branded website, from any phone — no app download. Players can add the site to their home screen and it behaves like an app under your league’s name and icon.',
      },
    ],
  },
]
