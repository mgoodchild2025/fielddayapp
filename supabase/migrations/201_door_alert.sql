-- Door Alert: a visitor scans a QR at a locked venue door and taps RING;
-- paired staff devices inside alert until someone acknowledges.
--
-- Public (visitor), pairing and display-device flows never touch these tables
-- from the browser: every read/write goes through /api/door/* route handlers
-- with the service role, after checking the token belongs to the request's
-- org. Org/league admins may read their org's rows (admin screens).

-- ── Stations: one per door kit, portable across venues ──────────────────────
CREATE TABLE IF NOT EXISTS public.door_stations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  location_label   text CHECK (char_length(location_label) <= 80),
  public_token     text NOT NULL UNIQUE,          -- visitor QR
  join_token       text NOT NULL UNIQUE,          -- staff QR (plain: re-shown on displays/cards)
  join_code        text NOT NULL UNIQUE CHECK (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  channel_key      text NOT NULL UNIQUE,          -- Realtime topic door:<channel_key>
  is_armed         boolean NOT NULL DEFAULT true,
  cooldown_seconds int NOT NULL DEFAULT 45 CHECK (cooldown_seconds BETWEEN 10 AND 600),
  fallback_message text CHECK (char_length(fallback_message) <= 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS door_stations_org_idx ON public.door_stations (organization_id);

-- ── Displays: self-paired devices (token shown once; only its hash kept) ────
CREATE TABLE IF NOT EXISTS public.door_displays (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id       uuid NOT NULL REFERENCES public.door_stations(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label            text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  token_hash       text NOT NULL UNIQUE,
  paired_ip_hash   text,
  screen_armed_at  timestamptz,                   -- last time it reported screen mode on
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS door_displays_station_idx ON public.door_displays (station_id) WHERE revoked_at IS NULL;

-- ── Rings ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.door_rings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id                  uuid NOT NULL REFERENCES public.door_stations(id) ON DELETE CASCADE,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_label              text,               -- snapshot at ring time
  visitor_name                text CHECK (char_length(visitor_name) <= 30),
  visitor_key_hash            text NOT NULL,      -- sha256 of the key the visitor polls with
  ip_hash                     text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  acknowledged_at             timestamptz,
  acknowledged_by_display_id  uuid REFERENCES public.door_displays(id) ON DELETE SET NULL,
  -- Re-notify stages already sent (1 = 60 s, 2 = 120 s). Updated with a guarded
  -- UPDATE so the in-process timer and the /state sweep never double-send.
  renotify_count              int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS door_rings_station_created_idx ON public.door_rings (station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS door_rings_ip_idx ON public.door_rings (station_id, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS door_rings_open_idx ON public.door_rings (station_id) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS door_rings_org_created_idx ON public.door_rings (organization_id, created_at DESC);

-- ── Notify-mode push subscriptions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.door_push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id       uuid NOT NULL REFERENCES public.door_displays(id) ON DELETE CASCADE,
  station_id       uuid NOT NULL REFERENCES public.door_stations(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint         text NOT NULL UNIQUE,
  p256dh           text NOT NULL,
  auth             text NOT NULL,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_success_at  timestamptz,
  last_failure_at  timestamptz
);
CREATE INDEX IF NOT EXISTS door_push_station_idx ON public.door_push_subscriptions (station_id);
CREATE INDEX IF NOT EXISTS door_push_display_idx ON public.door_push_subscriptions (display_id);

-- ── Join attempts (rate limiting; purged after 24 h) ────────────────────────
CREATE TABLE IF NOT EXISTS public.door_join_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash     text NOT NULL,
  station_id  uuid REFERENCES public.door_stations(id) ON DELETE CASCADE,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS door_join_attempts_ip_idx ON public.door_join_attempts (ip_hash, created_at DESC);

-- ── RLS: service role does everything; admins may read their org's rows ─────
ALTER TABLE public.door_stations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_displays           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_rings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_join_attempts      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_door_stations" ON public.door_stations;
CREATE POLICY "service_role_all_door_stations" ON public.door_stations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_door_stations" ON public.door_stations;
CREATE POLICY "admin_read_door_stations" ON public.door_stations
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_league_admin(organization_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "service_role_all_door_displays" ON public.door_displays;
CREATE POLICY "service_role_all_door_displays" ON public.door_displays
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_door_displays" ON public.door_displays;
CREATE POLICY "admin_read_door_displays" ON public.door_displays
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_league_admin(organization_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "service_role_all_door_rings" ON public.door_rings;
CREATE POLICY "service_role_all_door_rings" ON public.door_rings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_door_rings" ON public.door_rings;
CREATE POLICY "admin_read_door_rings" ON public.door_rings
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_league_admin(organization_id, (SELECT auth.uid())));

-- Push endpoints/keys and join attempts: service role only (never shown to anyone).
DROP POLICY IF EXISTS "service_role_all_door_push" ON public.door_push_subscriptions;
CREATE POLICY "service_role_all_door_push" ON public.door_push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_all_door_join_attempts" ON public.door_join_attempts;
CREATE POLICY "service_role_all_door_join_attempts" ON public.door_join_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── door_try_ring: rate limits + insert, atomically ─────────────────────────
-- Returns one row: ring_id/created_at on success, else reason in
-- ('not_found','disarmed','cooldown','station_limit') with retry_after seconds.
-- The advisory lock serialises rings per station so two taps can't both pass.
CREATE OR REPLACE FUNCTION public.door_try_ring(
  p_station_id uuid,
  p_ip_hash text,
  p_name text,
  p_visitor_key_hash text
)
RETURNS TABLE (ring_id uuid, created_at timestamptz, reason text, retry_after int)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st record;
  last_from_ip timestamptz;
  recent_count int;
  oldest_recent timestamptz;
  new_id uuid;
  new_created timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('door_ring:' || p_station_id::text));

  SELECT s.id, s.organization_id, s.is_armed, s.cooldown_seconds, s.location_label
    INTO st FROM public.door_stations s WHERE s.id = p_station_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, 'not_found'::text, 0; RETURN;
  END IF;
  IF NOT st.is_armed THEN
    RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, 'disarmed'::text, 0; RETURN;
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    SELECT max(r.created_at) INTO last_from_ip FROM public.door_rings r
     WHERE r.station_id = p_station_id AND r.ip_hash = p_ip_hash
       AND r.created_at > now() - make_interval(secs => st.cooldown_seconds);
    IF last_from_ip IS NOT NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, 'cooldown'::text,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (last_from_ip + make_interval(secs => st.cooldown_seconds) - now())))::int);
      RETURN;
    END IF;
  END IF;

  SELECT count(*), min(r.created_at) INTO recent_count, oldest_recent FROM public.door_rings r
   WHERE r.station_id = p_station_id AND r.created_at > now() - interval '60 seconds';
  IF recent_count >= 6 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, 'station_limit'::text,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (oldest_recent + interval '60 seconds' - now())))::int);
    RETURN;
  END IF;

  INSERT INTO public.door_rings (station_id, organization_id, location_label, visitor_name, visitor_key_hash, ip_hash)
  VALUES (p_station_id, st.organization_id, st.location_label, NULLIF(p_name, ''), p_visitor_key_hash, p_ip_hash)
  RETURNING door_rings.id, door_rings.created_at INTO new_id, new_created;

  RETURN QUERY SELECT new_id, new_created, NULL::text, 0;
END;
$$;
REVOKE ALL ON FUNCTION public.door_try_ring(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_try_ring(uuid, text, text, text) TO service_role;

-- ── Plan feature: paid tiers ────────────────────────────────────────────────
INSERT INTO public.plan_configs (tier, feature, enabled, limit_value) VALUES
('free',     'door_alert', false, null),
('starter',  'door_alert', true,  null),
('pro',      'door_alert', true,  null),
('club',     'door_alert', true,  null),
('internal', 'door_alert', true,  null)
ON CONFLICT (tier, feature) DO UPDATE
  SET enabled     = EXCLUDED.enabled,
      limit_value = EXCLUDED.limit_value,
      updated_at  = now();
