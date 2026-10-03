-- Indexes for the lookups every signed-in page makes, which had none.
--
-- 198 covered games / notifications / payments. This covers the "mine" lookups
-- behind the player dashboard, schedule, standings and my-events
-- (registrations and team_members by user), the event and TV display reads
-- (teams and registrations by league), and the reminders cron's
-- platform-wide scans. Every index below is justified by a query that exists
-- in the app today. Postgres does not index foreign keys automatically.
--
-- Plain CREATE INDEX (not CONCURRENTLY): the Supabase SQL Editor runs a script
-- in one transaction, where CONCURRENTLY is refused. Each build briefly blocks
-- writes to its table (reads continue) — well under a second at current data
-- sizes. Run at a quiet time. Every statement is IF NOT EXISTS, so re-running
-- is safe.

-- ── registrations ───────────────────────────────────────────────────────────
-- "My registrations": dashboard, schedule, standings, my-events, event page.
-- (The only other index, registrations_season_unique, is partial — queries
-- that don't repeat its WHERE clause can't use it.)
CREATE INDEX IF NOT EXISTS registrations_user_org_idx
  ON public.registrations (user_id, organization_id);

-- Event counts and spots, the reminders cron, the Stripe webhook, session
-- counts, admin event overview.
CREATE INDEX IF NOT EXISTS registrations_league_status_idx
  ON public.registrations (league_id, status);

-- Admin → Payments: newest registrations first, limit 500.
CREATE INDEX IF NOT EXISTS registrations_org_created_idx
  ON public.registrations (organization_id, created_at DESC);

-- Team rosters and the FK check when a team is deleted.
CREATE INDEX IF NOT EXISTS registrations_team_idx
  ON public.registrations (team_id) WHERE team_id IS NOT NULL;

-- ── team_members ────────────────────────────────────────────────────────────
-- "My teams": dashboard, my-teams, schedule, standings, game page, my-events,
-- and the TV showcase (re-run every 10–30s per screen). The existing unique
-- key leads with team_id, so it can't answer "which teams is this user on".
CREATE INDEX IF NOT EXISTS team_members_user_org_idx
  ON public.team_members (user_id, organization_id);

-- ── teams ───────────────────────────────────────────────────────────────────
-- An event's teams: event page, TV display (polled), brackets, playoff config,
-- dashboard, event spots, reminders cron. Also the FK path when an event is
-- purged.
CREATE INDEX IF NOT EXISTS teams_league_status_idx
  ON public.teams (league_id, status);

-- ── game_results ────────────────────────────────────────────────────────────
-- Standings / bracket / TV reads of confirmed results. (The app is also being
-- changed to filter these by league; this still serves the org-wide reads.)
CREATE INDEX IF NOT EXISTS game_results_org_status_idx
  ON public.game_results (organization_id, status);

-- ── session_registrations / game_rsvps ──────────────────────────────────────
-- Dashboard + schedule: the player's own session sign-ups and RSVPs.
CREATE INDEX IF NOT EXISTS session_registrations_user_org_idx
  ON public.session_registrations (user_id, organization_id);

CREATE INDEX IF NOT EXISTS game_rsvps_user_org_idx
  ON public.game_rsvps (user_id, organization_id);

-- ── org_members ─────────────────────────────────────────────────────────────
-- "Which orgs is this user in": choose-org at login, privacy, data retention.
-- The unique (organization_id, user_id) key can't serve a user-only lookup.
CREATE INDEX IF NOT EXISTS org_members_user_idx
  ON public.org_members (user_id);

-- Admin layout (every admin page) counts active players for the plan limit.
CREATE INDEX IF NOT EXISTS org_members_org_role_status_idx
  ON public.org_members (organization_id, role, status);

-- ── payments ────────────────────────────────────────────────────────────────
-- Admin dashboard: the five most recent payments.
CREATE INDEX IF NOT EXISTS payments_org_created_idx
  ON public.payments (organization_id, created_at DESC);

-- ── reminders cron (runs every few minutes, platform-wide) ─────────────────
-- Step 0 marks stale reminder bells read: type IN (...) AND read = false, no
-- org/user filter — the existing unread index leads with organization_id.
CREATE INDEX IF NOT EXISTS notifications_unread_type_idx
  ON public.notifications (type) WHERE read = false;

-- Scheduled announcements that are due.
CREATE INDEX IF NOT EXISTS announcements_due_idx
  ON public.announcements (scheduled_for) WHERE sent_at IS NULL AND email_sent = false;

-- Upcoming sessions across all orgs (the existing index leads with league_id).
CREATE INDEX IF NOT EXISTS event_sessions_status_scheduled_idx
  ON public.event_sessions (status, scheduled_at);

-- Push fan-out and the notifications settings reach count, per org (the
-- existing index leads with user_id).
CREATE INDEX IF NOT EXISTS push_subscriptions_org_idx
  ON public.push_subscriptions (organization_id);

-- ── profiles ────────────────────────────────────────────────────────────────
-- Email lookups at registration / guest claim / waivers (searched across all
-- users). Exact-match queries use this; the app's .ilike lookups are being
-- switched to lower-cased .eq so they can too.
CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles (email);
