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
- `playoff_configs` / `playoff_tiers` — playoff setup (tiers with seed ranges; tiers carry `inflow_from_tier_id` + `bye_seeds` for cross-tier drop-downs)
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
