-- Indexes for the three busiest tables, which had almost none.
--
-- Before this migration: `games` and `notifications` had no index at all beyond
-- their primary key, and `payments` had only team_id and payment_type — none of
-- the columns its finance loaders actually filter on. Every index below is
-- justified by a query that exists in the app today.
--
-- CONCURRENTLY keeps these from locking the tables while they build, which
-- matters on a live database. It cannot run inside a transaction block, so if
-- the SQL editor wraps the script and rejects it, run the statements one at a
-- time instead.

-- ── games ───────────────────────────────────────────────────────────────────
-- Public schedule, admin schedule, event page: filter by league, order by date.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_league_scheduled_idx
  ON public.games (league_id, scheduled_at);

-- Org-wide schedule and dashboard views.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_org_scheduled_idx
  ON public.games (organization_id, scheduled_at);

-- The reminders cron filters status + scheduled_at with NO organization filter,
-- so it scans the platform-wide table on every tick. This is the index that
-- stops that cost growing with total customer count.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_status_scheduled_idx
  ON public.games (status, scheduled_at);

-- Team pages and team stats look up a team's games from either side.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_home_team_idx
  ON public.games (home_team_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_away_team_idx
  ON public.games (away_team_id);

-- ── notifications ───────────────────────────────────────────────────────────
-- The nav bell runs on EVERY authenticated page load: org + user + unread,
-- newest first. Partial on read = false keeps the index small as the table
-- grows, since read rows are never queried this way.
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_unread_idx
  ON public.notifications (organization_id, user_id, created_at DESC)
  WHERE read = false;

-- The pending-media alert gate checks for an existing unread row of one type.
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_user_type_idx
  ON public.notifications (organization_id, user_id, type);

-- ── payments ────────────────────────────────────────────────────────────────
-- Event P&L, org P&L, the financial report and the CSV exports all filter here.
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_org_league_idx
  ON public.payments (organization_id, league_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_org_status_idx
  ON public.payments (organization_id, status);

-- Per-registration lookups (dashboard banners, admin payment rows).
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_registration_idx
  ON public.payments (registration_id);

-- Team-fee dedupe: league + payment_type + team, the rule that has to stay
-- duplicate-tolerant because of the historical double-paid rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_league_type_team_idx
  ON public.payments (league_id, payment_type, team_id);

-- The Stripe webhook resolves a session id to its pending payment row. This is
-- on the payment-confirmation path, so it should never be a sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_session_idx
  ON public.payments (stripe_checkout_session_id);
