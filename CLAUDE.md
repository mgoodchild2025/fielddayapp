# Fieldday — Sports League Management Platform

## Stack
- **Framework**: Next.js (App Router, server components, server actions)
- **Database**: Supabase (Postgres + Auth + Storage) via `@supabase/ssr`
- **Styling**: Tailwind CSS + CSS variables for per-org branding
- **Payments**: Stripe (checkout sessions + webhooks)
- **Email**: Resend
- **Forms**: react-hook-form + zod
- **CSV parsing**: papaparse

## Architecture

### Multi-tenancy
Every org has its own subdomain (e.g. `acme.fielddayapp.ca`). The proxy (`proxy.ts` — Next.js 16 middleware convention, NOT `middleware.ts`) injects an `x-org-id` header on every request. Server components read it via `getCurrentOrg(headersList)`.

Local dev: set `DEV_ORG_ID=<uuid>` in `.env.local` — the proxy injects it for `localhost` requests.

### Route groups
```
app/(org)/
  (auth)/        — login, register, reset-password (public)
  (public)/      — leagues, schedule, standings (requireAuth — logged-in only, NO org membership required)
  (player)/      — dashboard, profile (requireAuth)
  admin/         — admin panel (requireOrgMember with admin role)
  register/      — league registration flow
```

### Auth helpers (`lib/auth.ts`)
- `requireAuth()` — user must be logged in; used on public player-facing pages
- `requireOrgMember(org, roles?)` — user must have an `org_members` row; used for admin pages
- **Do NOT use `requireOrgMember` on public pages** — players won't have an `org_members` row until they complete their first registration

### Key files
| File | Purpose |
|------|---------|
| `proxy.ts` | Middleware: org context injection + Supabase session refresh |
| `lib/tenant.ts` | `getCurrentOrg()` — reads `x-org-id` header |
| `lib/auth.ts` | Auth helpers |
| `lib/format-time.ts` | `formatGameTime()` + DST-safe `parseLocalToUtc()` |
| `lib/supabase/server.ts` | Supabase server client (cookie-based) |
| `actions/` | All server actions (auth, leagues, teams, scores, registrations, etc.) |
| `components/scores/admin-score-entry.tsx` | Inline score entry for admin schedule table |
| `components/scores/captain-score-entry.tsx` | Score submit/confirm for captains on public schedule |
| `components/layout/admin-sidebar.tsx` | Desktop sidebar + mobile drawer for admin panel |
| `components/layout/org-nav.tsx` | Public nav with mobile hamburger |
| `components/layout/mobile-nav.tsx` | Mobile slide-in nav for public pages |

## Database

### Key tables
- `organizations` — orgs (slug, name, status)
- `org_members` — user ↔ org membership (roles: org_admin, league_admin, captain, player)
- `org_branding` — per-org branding (logo, colours, fonts, timezone, custom_domain)
- `leagues` — league details (status flow: draft → registration_open → active → completed → archived)
- `teams` — teams within leagues
- `team_members` — user ↔ team membership (roles: captain, player)
- `team_join_requests` — pending join requests from players
- `registrations` — player registrations to leagues
- `games` — scheduled games (home/away teams, court, week, status)
- `game_results` — scores (status: pending → confirmed)
- `playoff_configs` / `playoff_tiers` — playoff setup (config carries the playoff roster: `custom_seed_order` + `excluded_team_ids`; tiers carry seed ranges plus `inflow_from_tier_id` + `bye_seeds` for cross-tier drop-downs)
- `brackets` / `bracket_matches` — generated brackets; matches carry `winner_to_match_id` / `loser_to_match_id` (+ slot) routing and `is_bye`
- `org_playoff_templates` — org-saved playoff format templates (tiers as JSONB)
- `payments` — Stripe payment records
- `waivers` / `waiver_signatures` — waiver management
- `notifications` — in-app notifications
- `profiles` — user profile data (full_name, email, phone)
- `player_details` — extended player info (emergency contact, jersey size, etc.)

### Pending migration
Migration `supabase/migrations/004_apply_pending_changes.sql` may need to be applied manually via the Supabase SQL Editor at:
`https://supabase.com/dashboard/project/orjczrkpqkizvowvqlyv/sql/new`

This adds: `team_join_requests` table, `venue_*`/`organizer_*`/`age_group`/`team_join_policy` columns on leagues, `timezone` on `org_branding`, etc.

## Score entry flow
- **Admins**: Admin → Leagues → [League] → Schedule — each game row has inline `AdminScoreEntry` component. Saves as `confirmed` immediately (no two-step).
- **Captains**: Public `/schedule` — past games show `CaptainScoreEntry`. One captain submits (status: `pending`), opposing captain confirms (status: `confirmed`).
- **Actions**: `submitScore`, `confirmScore`, `adminSetScore` in `actions/scores.ts`

## Scoreboard (free PWA)
`/scoreboard` — a free, login-optional scoreboard that works on every host (apex + org sites). Client app in `components/scoreboard/scoreboard-app.tsx`, **event-sourced**: every score change is an event; scores + completed sets derive by folding the event list, so undo = pop and the per-set history matches `game_results.sets` (`{home,away}[]`) exactly. Tap panel = +1, swipe down ≥40px = −1, long-press = edit team; a stale gesture (>1.2s, lost pointerup) is discarded on the next touch or the board locks. **Set formats are deliberately not modelled** — no targets/best-of/win-by-2 config: the scorekeeper taps "End set N" (middle bar) and "🏁 End match" (menu; folds any in-progress set, `{t:'end'}` event, ties legal for regular games), so caps, time limits, and fixed-set nights all just work. State persists to localStorage per game (`fieldday-scoreboard-v1[:game:<id>|:match:<id>]`).

### PWA plumbing
- Own manifest at `/scoreboard/manifest` (fullscreen, scope `/scoreboard`, icons `scoreboard-icon-{192,512}.png`). **iOS ignores manifest icons** — the page sets `apple-touch-icon` via metadata.
- `/scoreboard-sw.js` (route handler) is **the app's ONLY service worker** — served from a root path because a SW's directory caps its scope (`/scoreboard/sw.js` couldn't claim `/scoreboard` itself), but registered ONLY with `scope: '/scoreboard'` so it never controls other pages. Network-first navigations w/ cache fallback, stale-while-revalidate subresources.
- Install: hint bar (one-time, dismissible) + menu item "Add to home screen" — `beforeinstallprompt` is captured at the app level (Chrome gets a real install dialog); iOS gets Share-menu instructions. Installed check must use `display-mode` media query AND `!document.fullscreenElement` (in-page fullscreen also matches `display-mode: fullscreen`).

### Game attachment (V2)
`/scoreboard?game=<id>` on an org host prefills teams/colours/mode (volleyball/beach → sets mode) via `x-org-id`-validated load in `app/scoreboard/page.tsx`. Role decides saving: org/league admin → `adminSetScore` (confirmed); captain of either team → `submitScore` (pending → opponent confirms); others get a score-only board. **Set sports save sets-won as home/away score + the `sets` array** (AdminScoreEntry convention); team A is pinned to the home team (side swap is display-only). **Saving folds an in-progress set into the set line** (counted for the leader) — a "Will save 2–0 · sets …" preview shows exactly what gets recorded; never drop the partial set silently. Attached boards carry a Courtside round-trip: "←" in the middle bar + post-save "Done — back to Courtside/Event page"; "New game" is standalone-only. Entry points: Courtside cards + event-page schedule rows (captains).

### Playoff bracket matches
Bracket matches are NOT games rows — they live in `bracket_matches` with admin-only score entry. `/scoreboard?match=<bracketMatchId>` attaches the board to one (admin saves via `recordBracketScore`, which auto-advances the winner; sets map to the bracket schema's **`{s1,s2}`** shape, ties refused; captains get score-only). Courtside merges the day's scheduled bracket matches (both teams set, byes excluded, admin-scope filtered) into its lists as amber cards labelled via `roundDisplayName`.

### Live scores (V3 + C)
The authorized scorer's board broadcasts on Supabase Realtime channel `scoreboard:<leagueId>` (ephemeral broadcast, NO tables) — on every change + 15s heartbeat, keyed by games.id or bracket_matches.id. **`lib/use-live-scores.ts` is the one consumer**: `useLiveScores(leagueId)` shares ONE channel subscription per event via a module registry (never subscribe per row) and prunes boards quiet for 75s. Surfaces: the `live_scores` TV zone, live overlays in the TV schedule/bracket zones, `LiveScoreBadge` (`components/scoreboard/live-score-badge.tsx`) on event-page schedule rows, and live points in `bracket-view.tsx`. Rule everywhere: the live overlay renders only where no saved result exists — saved scores always win.

### Discovery (deliberate placement — don't re-add elsewhere)
Menu-only in the app: mobile drawer (`mobile-nav.tsx`) + desktop nav user menu (`nav-user-menu.tsx`). NOT on the org top nav, org footer, or player dashboard (removed on request). Marketing: apex footer link + `ScoreboardPromo` section on the marketing page (free tool = lead magnet; the integrated version is the upsell).

## Playoffs & brackets
Admin → Events → [Event] → Bracket renders `PlayoffConfigWizard` (`components/bracket/playoff-config-wizard.tsx`). Lifecycle per tier bracket: **scaffold** (placeholder labels, no teams) → **seed** (teams assigned from standings) → **publish** (`status='active'`, visible to players). Publishing before seeding is allowed; unpublish keeps seeding.

### Structure
- A `playoff_config` holds ordered `playoff_tiers` (Gold/Silver/…), each mapping a seed range to its own bracket. "Generate All Brackets" (`generateAllTierBrackets` in `actions/playoff-config.ts`) scaffolds every tier and is safe to re-run — tiers whose brackets have recorded scores are skipped.
- Generators live in `lib/bracket.ts` (pure, tested): single elim (byes for non-power-of-2), double elim (LB rounds numbered `100+`, grand final `200`), 6/14-team all-play, and `generateInflowBracketSpec` for drop-down receivers.

### Cross-tier drop-downs (flexible brackets)
- A tier may declare `inflow_from_tier_id` (+ `bye_seeds`): it receives the source tier's first-round losers; its top N direct seeds bye past the entry round. Example: 10 teams → Gold seeds 1–8; Silver = seeds 9–10 (2 byes to semis) + the 4 Gold QF losers.
- `lib/tier-inflows.ts` is the single source of truth for cross-bracket wiring: `wireLeagueTierInflows` (idempotent; re-run after ANY scaffold/seed rebuild of either side) and `clearInboundRoutes` (must run before deleting a bracket's matches — the `bracket_matches` self-FKs have **no ON DELETE**, so deleting referenced rows otherwise violates the constraint).
- `scaffoldBracket`/`seedBracket` (`actions/brackets.ts`) detect inflow receivers via `getInflowContext` and rebuild with the inflow spec — never assume the standard generator shape for a receiver.
- Runtime advancement (`advanceWinner`/`advanceLoser`) follows `winner_to_match_id`/`loser_to_match_id` wherever they point, including into another bracket.
- Admins can also hand-edit any match's routing (winner/loser destination + slot, across brackets) in the Edit Match modal via `updateMatchRouting`.

### Custom (hand-built) brackets — M1 + M2 + M3
- A tier's format can be **`custom`**: the first "Generate All Brackets" run creates the bracket with one pre-laid first round of empty matches (`insertCustomBracket` in `actions/playoff-config.ts` — round number = match count, matching the engine's rounds-count-down convention), then never touches it again. Re-runs skip custom tiers; `scaffoldBracket`/`seedBracket` refuse custom brackets outright.
- The admin owns the shape: seat teams via `overrideBracketSlot`/`swapBracketTeams`, wire routes via `updateMatchRouting`, all from the Edit Match modal. `clearBracketSeeding` is safe on custom brackets (nulls slots only, no structural rebuild).
- Custom tiers cannot declare drop-down inflow (receivers must be single elim; enforced in `savePlayoffConfig` and the wizard nulls stale inflow on type switch).
- **Seat & advance (M3)**: on custom brackets, empty slots render an in-place team picker (`overrideBracketSlot` under the hood) and matches get "✓ Advance a team" — `declareMatchWinner` completes a match with NULL scores (winner shows a "W", public list shows "–"), advancing along the normal routes. `clearBracketMatchResult` is the match-id analogue of `reverseBracketAdvancement` (which is game_id-keyed and never covered game-less matches): pulls advanced teams out of unplayed downstream slots and un-completes the match. Both refuse when a downstream match is played.
- **Medal matches**: `bracket_matches.medal_match` ('gold'|'bronze', one of each per bracket — partial unique index) marks the deciding matches on hand-built shapes. `setMatchMedal` has move semantics. Display convention: gold match winner 🥇 / loser 🥈, bronze match winner 🥉; the gold match drives the champion callout when present, and a podium strip renders under the bracket once gold is decided. Toggled via 🥇/🥉 chips in the builder.
- **Structure (M2)**: `addBracketMatch`/`deleteBracketMatch`/`addBracketRound`/`deleteBracketRound`/`renameBracketRound`/`toggleMatchBye` in `actions/brackets.ts`; UI is `components/bracket/bracket-builder.tsx`, shown on custom tiers. Deleting matches clears routes INTO them first (`clearRoutesInto` — per-match analogue of `clearInboundRoutes`). Rounds count down (round 1 = final): "earlier" = max+1, "later" = min−1, refused below 1. Admin round names live in `brackets.round_names` (jsonb, string keys); `roundDisplayName` in `lib/bracket.ts` is the everywhere-lookup (view, print, schedule labels) with `getRoundName` as fallback. Matches with scores are immutable to all structural tools.

### Playoff roster & persistent seeding
- The **roster** is the admin's answer to *who is in the field and in what order*: `playoff_configs.excluded_team_ids` (teams sitting out) and `playoff_configs.custom_seed_order` (ordered team ids; null = standings order). Edited on the wizard's tiers step (`components/bracket/playoff-roster-panel.tsx`), saved with the config, so it survives reload, re-seed and regeneration.
- `lib/playoff-roster.ts` is the pure logic (`applyRoster`, `moveInField`, `renumberSeeds`) and is tested. Exclusions apply under **every** seeding method — teams below a sat-out team shift up. A custom order **replaces** the computed order outright (pool/division seeding included); teams missing from a stale order are appended in standings order, so nobody is silently dropped.
- `seedBracket` (`actions/brackets.ts`) loads the roster via the bracket's tier → config and applies it before tier slicing. `generateAllTierBrackets` scaffolds with flat "Seed N" labels when a custom order exists (position labels like "1st - Pool A" would be wrong).
- `savePlayoffConfig` persists the roster when passed one (omit to leave it untouched); `savePlayoffRoster` updates it alone from an existing config.

### Format templates
- Built-ins in `lib/playoff-templates.ts` (parameterized by team count; `applicableTemplates` only offers shapes that validate). Org-saved templates in `org_playoff_templates` via `actions/playoff-templates.ts`; "Save as template…" on the wizard's tiers step.

### Constraints
- Drop-downs only flow downward (source tier must be earlier in the list — rules out cycles); both source and receiver must be single elimination.
- Inflow shape rule: entry-round teams (`inflow + direct − byes`) must be even, and entry winners + byes must total a power of 2 (`validateInflowBracket` produces the admin-facing message).

## Game status management (cancel / postpone / restore)
Admins can change a game's status from the **Edit Game** modal (pencil icon on any row in Admin → Leagues → [League] → Schedule).

### Status flow
```
scheduled → cancelled   (via cancelGame)
scheduled → postponed   (via postponeGame)
cancelled → scheduled   (via restoreGame)
postponed → scheduled   (via restoreGame)
```

### Actions (`actions/schedule.ts`)
| Action | Function | What it does |
|--------|----------|-------------|
| Cancel | `cancelGame` | Sets `status = 'cancelled'`, stores optional `cancellation_reason` |
| Postpone | `postponeGame` | Sets `status = 'postponed'`, stores optional `cancellation_reason` |
| Restore | `restoreGame` | Sets `status = 'scheduled'`, clears `cancellation_reason` |

All three accept a `notify: boolean` parameter. When `true` and the game has assigned teams, an in-app notification and email are sent to both teams:
- Cancel: "Game Cancelled – {Home} vs {Away}"
- Postpone: "Game Postponed – {Home} vs {Away}"
- Restore: "Game Back On – {Home} vs {Away}"

### UI behaviour
- The **Cancel** and **Postpone** buttons are shown when `status === 'scheduled'` (or any non-cancelled/non-postponed status).
- Clicking either button expands an inline confirmation form with an optional reason field and a "Notify teams" toggle.
- Once cancelled or postponed, both buttons are replaced by a single **Restore Game** button.
- On the public schedule, cancelled games show a red "Cancelled" badge and postponed games show an amber "Postponed" badge; the cancellation reason is displayed beneath if one was provided.
- **Key file**: `components/schedule/edit-game-modal.tsx`

## Team logos across public surfaces
- `TeamAvatar` (`components/ui/team-avatar.tsx`; `logoUrl`/`color`/`name`/`size`, deterministic coloured-initial fallback) is the one renderer — used by standings (public event tab + admin), bracket match cards, and podiums, plus the pre-existing team pages.
- Identity travels with the data: `TeamStat` (`lib/standings.ts`) carries optional `logoUrl`/`color`; `BracketMatchData` carries per-slot `team{1,2}LogoUrl`/`Color` (both bracket loaders build a `teamMetaMap` beside the existing name map); `PodiumMedal` carries optional `logoUrl`/`color` resolved from the live team row via `medals.team_id` — medals snapshot names, so a deleted team still renders its initial.
- Name cells that gained an avatar use `flex … min-w-0` + `truncate`, so the logo can't squeeze text off-screen on mobile.

## Medals & the trophy case
- Medals are **awarded and frozen**, never derived at page load: `medals` (league/team-name snapshots, placement `gold|silver|bronze|tier_champion`, label, deciding match) + `medal_recipients` (roster snapshot at award time — user_id nullable so the row survives account deletion).
- Pure derivation in `lib/medals.ts` (tested): explicit medal matches win; else SE final/3rd-place, DE grand-final/LB-final conventions. First tier awards the podium, later tiers award "{Tier} Champion".
- `awardLeagueMedals` (actions/medals.ts) is idempotent (replaces the league's medals; notifies recipients first-time-only); auto-runs when `updateLeagueStatus` hits 'completed'; "🏅 Award Medals" in the bracket page ⋯-menu re-runs after corrections. `backfillOrgMedals` (action only — its Events-screen button was removed once the pre-feature history was swept) sweeps completed/archived events.
- **Hall H3**: showcase zone source `banners` — org-wide golds sweep the TV as giant brand-tinted pennants (loader in `getDisplayData`, exclusive source, no lineups toggle). `/champions/opengraph-image.tsx` (next/og, satori-safe: no clip-path) unfurls shared links with the newest three banners + title count, org-resolved via `x-org-id`.
- **Hall of Champions**: `/champions` (public group, unauthenticated like gallery) — banner wall (CSS pennants, golds only, anchor-links to podiums), season sections reusing `EventPodium`, Dynasties board (titles by team-NAME snapshot, ≥2 titles, caveat labelled) and Most Decorated top-10 (🥇-weighted, links to card pages). Loader `lib/hall-of-champions.ts` (`getHallOfChampions`, one org-wide medals read). Nav link "Champions" (desktop + mobile) renders only when the org has medals.
- Public podium: `EventPodium` (`components/medals/event-podium.tsx`) renders "Final Results" at the top of the public event page's overview whenever the event has medals — gold leads, silver/bronze flank, tier titles follow, roster-snapshot names under each.
- Admin view: `AdminMedalsPanel` on the bracket page — every awarded medal with team, label, and recipient names, plus per-medal revoke.
- Display: one shared `MedalCase` strip + celebration modal (`components/medals/medal-case.tsx`; confetti on the owner's first open per medal, localStorage-tracked, reduced-motion aware). Loaders in `lib/medal-queries.ts`. Surfaces: dashboard greeting strip, profile case grouped by year, team page shelf + roster mini-medals.

## Pending-media admin alerts
- Uploading event media (status 'pending') alerts org/league admins in-app + SMS with a link to `/admin/events/[id]/media` (`notifyAdminsOfPendingMedia` in `actions/event-media.ts`, fire-and-forget). **Read-state gated**: while an admin has an unread `media_pending` notification for that event, further uploads stay quiet — a 20-photo burst = one ping, one text; opening the bell link marks it read and re-arms. SMS only to admins with `profiles.phone`, and only when a fresh in-app notification was created. The uploader is never alerted about their own upload.
- Notification bell supports generic links: `data.href` (+ optional `data.link_label`) renders a link that marks the notification read on click.

## Broadcast bios & the showcase display zone
- `player_bios` (org+user unique): hero photo (falls back to `profiles.avatar_url`), number, position, hometown, years playing, 120-char tagline. **`show_on_displays` is opt-in, default off** — nobody rotates on a public TV who didn't ask to; `hidden_by_admin` lets admins pull a bio without deleting it (`setBioHidden`).
- **Card collection (C3)**: shareable card page at `/players/[userId]/card` — **consent-gated**: public (no login) when the player's `show_on_displays` is on and not admin-hidden, else requireAuth (roster-modal visibility). The profile toggle copy covers both exposures. Banner tints shared via `lib/banner-tints.ts` (`bannerTint(team, year)` hash — same colour on the Champions page and the TV), team card binder at `/teams/[teamId]/cards` (roster as flippable cards; same access as the team page), "View & share →" from the dashboard card section, "🃏 Card Binder" from the team page. Shared loader `lib/player-card.ts` (`getPlayerCardData` — respects `hidden_by_admin`; `formatMedalShelf`). Treatments derived from the record in `BioFlipCard`: seasonCount ≤ 1 → ROOKIE ribbon; `career.reigningChampion` (gold in the last 365 days, computed in `getPlayerCareer`) → animated gold foil border (reduced-motion = static).
- **Card flip (hockey-card back)**: `BioFlipCard` (`components/bios/bio-flip-card.tsx`) wraps the bio front + `PlayerCardBack` with a CSS 3D flip (reduced-motion = instant swap; hidden face aria-hidden). Back = vitals, per-sport season table (max 3 stat columns from the sport's first `stat_definitions`), career totals, shelf, tagline; rookies get "Rookie season", never a table of zeros. Career assembly is `lib/career.ts` (`buildCareer` pure + tested; `getPlayerCareer` loader over team_members→teams→leagues + `player_game_stats` + medals; season label = season_start_date year, else created year; per-org). Mounts: dashboard "My card" (under greeting), roster modal (career lazy-loads on open via `getCareerForUser` in `actions/career.ts`), profile editor preview. TV showcase stays front-only.
- One card everywhere: `PlayerBioCard` (`components/bios/`) renders the TV lower-third at `size='md'|'tv'` — used by the profile editor's live preview (`BioEditor`), the team-page roster tap-a-name modal (`BioNameButton`), and the display showcase. Medal shelf comes from the trophy case.
- **S3 production values**: `lineups?: boolean` on the showcase zone — when the next scheduled game (both teams set) is within 45 min, the rotation opens with a matchup slide ("UP NEXT · A vs B · 7:30 · Court 2") then both rosters' opted-in cards (home, then away; lineup bios don't repeat in the tail). Podium teams' cards carry a champion ribbon + gold ring (from this event's `medals`). "📸 Photo wall preset" button in the control panel sets main_sidebar = photo showcase + QR to the public event page.
- **Showcase display zone** (`type:'showcase'` in `lib/display-types.ts`): source bios/photos/both, transitions fade/slide/kenburns, seconds per slide, shuffle/newest. Data in `getDisplayData` (`actions/display.ts`): opted-in bios of the event's active registrants + approved `event_media` images (photos only — no video on gym wifi). Zone component `components/display/zones/showcase-zone.tsx` (chyron sweep, preloading, reduced-motion safe).

## Sales tax on purchases
- `org_tax_rates` (name, %, inclusive flag, applies_to `all|registrations|merch`, `stripe_tax_rate_id`, active): max two active rates (GST+PST), one mode (all inclusive or all exclusive). Managed on Admin → Settings → Payments; each rate is mirrored as a Stripe Tax Rate in the ORG'S OWN account (immutable → edit = deactivate + recreate). `payments.tax_cents` keeps the split on every record.
- **Rule everywhere: subtotal → discounts → tax.** Stripe checkouts attach `tax_rates` to line items (registration/team/instalment/drop-in/guest routes; merch lines get merch-scoped rates) and the webhook records `session.total_details.amount_tax`. The SHOP route is the exception (its discount is a negative line item): it computes tax via `lib/tax.ts` and appends a named tax line. Offline (cash/e-transfer) pending payments store gross + `tax_cents` via the same helper.
- **Grandfathering:** instalment enrolments only apply rates that existed at enrolment time (`rate.created_at <= enrollment.created_at`) — signed commitments never reprice.
- `lib/tax.ts` (pure + tested): `computeTax` (exclusive adds, inclusive backs out; per-rate half-up rounding, remainder on last line), `taxSuffix` ("+ HST 13%" / "incl. …") shown on event-page prices, season-pass quotes, register payment step, and the merch cart. Pricing-planner recommendations are labelled pre-tax; the admin payments Total Collected card shows "incl. $X tax".

## Finances
All loaders/actions in `actions/finances.ts`; org screen at Admin → Finances (org_admin + `financial_tools` plan gate), per-event tab at Admin → Events → [Event] → Finances.

### Revenue counting rules (apply EVERYWHERE money is summed)
- Count `payments` with status `paid`/`manual`/`refunded` as GROSS, then subtract `refunded_cents` — a full refund nets to zero, a partial refund keeps the retained portion. Refunds are dated by `refunded_at` (report-period rule), set via `adminUpdateRegistrationPayment` (status refunded + optional refundAmountCents) or `refundTeamPayment`; re-recording a payment clears them.
- **Team fees count once per team** (`payment_type='team'`, dedupe by `league_id:team_id`, prefer the paid row) — the repeated-Mark-as-Paid bug era left duplicate paid team rows in the wild, so every lookup must be duplicate-tolerant (no `.maybeSingle()` on team payments).
- **Deleted-registration orphans don't count**: `removeRegistration` deletes pending offline rows, detaches the rest to `registration_id: null` — a per-player payment counts only while its registration exists.
- Same rules live in `getEventPnl`, `getOrgPnl`, `getFinancialReport`, `getEventRevenueBySession`; the payments CSV export includes every raw row plus a `counted_in_report` column so it still reconciles.

### Per-team payments ledger
Admin → Payments shows ONE row per team for per-team leagues (synthesized team rows named by team, "Team fee" sublabel, team-direct Mark-as-Paid via `recordManualPayment({ teamId })`); member registration rows are dropped unless they carry a payment of their own. `recordManualPayment` updates the pending team row, re-records onto the paid row on repeat clicks (never inserts duplicates), and sweeps other never-paid offline team rows.

### Offline (e-transfer/cash/cheque) lifecycle
`selectOfflinePayment`/`selectOfflineTeamPayment` record the tax-inclusive gross + `tax_cents` and return them for display. Leaving a session (`leaveSession`) deletes the withdrawn registration's pending offline rows; dashboard "Payment outstanding" banners require a live registration (player) or a team with no paid row (team).

### Overhead & allocation
`org_overhead_expenses` (org-wide costs; period is informational) + `org_overhead_allocations` (split one expense across events — unique per expense+event, sum ≤ expense, editor on the overhead ledger with equal / by-session-count / manual splits). Event P&L shows its share as "Shared overhead (allocated)"; org totals count the full overhead once, allocations are attribution only — never add both.

### Reports & exports
`getFinancialReport(orgId, from, to)` + printable page at `/admin/finances/report?from&to` (admin chrome is `print:hidden`). **Date semantics**: payments by `paid_at` (fallback `created_at`), expenses/overhead by `incurred_on`, other income by `received_on`, merch orders by `created_at`. Tax remittance line = sum of `payments.tax_cents` in range. CSV ledgers at `GET /api/export/finances?type=payments|expenses|overhead|other_income|merch&from&to` (UTF-8 BOM via `lib/export/csv-helpers.ts`).

### Attachments & receipts
`expense_attachments` (polymorphic: `kind` event|overhead + `expense_id`, no cross-table FK — deleting an expense must call `deleteAttachmentsOf` first): any number of labelled files (Receipt/Invoice/Contract/Other) per expense. Files live in the **private** `expense-receipts` bucket at `<org>/<kind>/<expenseId>/<attachmentId>.<ext>` — never a public URL, viewing goes through `getAttachmentUrl` (10-min signed URL, finance admins only). The legacy single `receipt_path` columns were migrated in (190) and are no longer written. UI: `AttachmentsControl` in `components/finances/receipt-control.tsx` on both ledgers.

### Editing & tax paid on expenses
- Expenses, other income, and overhead are all editable in place (`updateEventExpense`/`updateEventRevenue`/`updateOrgOverhead`; the managers reuse the add form). Lowering an overhead amount below its event allocations is refused.
- `tax_cents` on `event_expenses`/`org_overhead_expenses` = the **recoverable** sales tax included in the amount (HST/GST/QST — not PST). Entry is manual with a one-tap "Calc" back-out (`TaxCalc` in `components/finances/tax-calc.tsx`, `backOutTax` in `lib/expense-tax.ts`) at an editable rate — prefilled from the org's configured sales tax when one exists, otherwise the last rate typed (localStorage); an org that charges no tax still pays HST on expenses, so the helper is never hidden. The financial report shows **tax collected − tax paid = net remittance** (both by the report's date semantics); CSV ledgers carry `tax_included` + `attachments` columns.

## Drop-in registration modes & season-pass proration
- `leagues.registration_mode` ∈ `session | season | both`. In **both** mode the public event page shows the season-pass CTA and the per-session join list side by side; `isSeasonPickup` stays false in both mode (per-session gates behave like session mode), season-side gates use `offersSeasonPass`.
- **Proration** (`leagues.season_pass_prorate`, admin toggle on Edit Event): pass price = full price × remaining/total non-cancelled sessions, rounded up to the dollar, floored at `drop_in_price_cents`. Pure logic + quote loader in `lib/season-pass.ts` (tested) — used by the event page display, the register flow (`seasonPassQuote` prop), and the Stripe checkout charge (`app/api/stripe/checkout/route.ts`), so display and charge can never disagree. Applies at purchase time only; sold passes never reprice.
- Occupancy already unions pass holders (count toward every session) with per-session sign-ups — unchanged for both mode.

## Branding
CSS variables set by `BrandProvider` from `org_branding` row:
- `--brand-primary`, `--brand-secondary`, `--brand-bg`, `--brand-text`
- `--brand-heading-font`, `--brand-body-font`

## Common patterns
```typescript
// Server component — get org context
const headersList = await headers()
const org = await getCurrentOrg(headersList)

// Auth check (public pages)
await requireAuth()

// Auth check (admin pages)
await requireOrgMember(org)  // or with roles: requireOrgMember(org, ['org_admin'])

// Supabase client
const supabase = await createServerClient()
```

## What NOT to do
- Don't use `middleware.ts` — Next.js 16 uses `proxy.ts` (exports `proxy` function + `config`)
- Don't call `requireOrgMember` on public player pages (loops unauthenticated players to /login)
- Don't use `CREATE POLICY IF NOT EXISTS` in SQL — use `DROP POLICY IF EXISTS` + `CREATE POLICY`
