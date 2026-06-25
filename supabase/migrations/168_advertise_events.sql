-- 168_advertise_events.sql
-- Advertise Upcoming Events: promotion flags + teaser on leagues, a public
-- "notify me when registration opens" interest list, and a widened announcements
-- audience for outbound advertising. Apply manually via the Supabase SQL editor.

-- 1. Promotion flags + teaser blurb on leagues ------------------------------
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS advertised     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teaser_text    text,
  ADD COLUMN IF NOT EXISTS notify_on_open boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN leagues.advertised IS
  'When true and status=draft with registration_opens_at in the future, the event shows a public "coming soon" teaser + notify-me form.';
COMMENT ON COLUMN leagues.featured IS
  'When true, the event is highlighted on the org homepage / events list.';
COMMENT ON COLUMN leagues.teaser_text IS
  'Short admin-written blurb shown on the public coming-soon teaser card.';
COMMENT ON COLUMN leagues.notify_on_open IS
  'When true, the notify-me interest list is auto-emailed when registration opens.';

-- Partial index for the public "coming soon" query
CREATE INDEX IF NOT EXISTS idx_leagues_advertised
  ON leagues (organization_id, advertised)
  WHERE advertised = true AND deleted_at IS NULL;

-- 2. Public notify-me interest list -----------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS event_interest (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  league_id       uuid NOT NULL REFERENCES leagues(id)        ON DELETE CASCADE,
  email           citext NOT NULL,
  name            text,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'coming_soon',  -- coming_soon | events_list | homepage
  created_at      timestamptz NOT NULL DEFAULT now(),
  notified_at     timestamptz,
  unsubscribed_at timestamptz
);

-- One signup per email per event
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_interest_league_email
  ON event_interest (league_id, lower(email));

-- Pending recipients for the "registration opened" notification
CREATE INDEX IF NOT EXISTS idx_event_interest_league_pending
  ON event_interest (league_id)
  WHERE notified_at IS NULL AND unsubscribed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_interest_org
  ON event_interest (organization_id);

ALTER TABLE event_interest ENABLE ROW LEVEL SECURITY;

-- Public (anon) may INSERT a signup. Validation/dedupe/rate-limiting happen in
-- the server action (service role). No SELECT/UPDATE/DELETE for anon.
DROP POLICY IF EXISTS event_interest_anon_insert ON event_interest;
CREATE POLICY event_interest_anon_insert ON event_interest
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only org admins of the row's org may read the list.
DROP POLICY IF EXISTS event_interest_admin_select ON event_interest;
CREATE POLICY event_interest_admin_select ON event_interest
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members m
      WHERE m.organization_id = event_interest.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('org_admin', 'league_admin')
    )
  );
-- service_role bypasses RLS; all writes (dedupe, notified_at, unsubscribe) use it.

-- 3. Widen announcements audience for outbound advertising -------------------
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_type_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_type_check
  CHECK (audience_type IN ('org', 'league', 'team', 'players',
                           'past_participants', 'marketing', 'event_interest'));
