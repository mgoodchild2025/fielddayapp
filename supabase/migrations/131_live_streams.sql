-- ── Live stream (manual "Go Live") ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_streams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform        text        NOT NULL CHECK (platform IN ('youtube', 'instagram', 'other')),
  title           text,
  url             text        NOT NULL,
  embed_url       text,                  -- derived (YouTube → embed src); null when not embeddable
  status          text        NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  detected_via    text        NOT NULL DEFAULT 'manual' CHECK (detected_via IN ('manual', 'api')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One active stream per org is the common case; index the live lookup
CREATE INDEX IF NOT EXISTS live_streams_org_live_idx
  ON public.live_streams (organization_id, status)
  WHERE status = 'live';

ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;

-- Public can read live streams (to show the banner/embed on the public site)
DROP POLICY IF EXISTS "live_streams_public_read" ON public.live_streams;
CREATE POLICY "live_streams_public_read" ON public.live_streams
  FOR SELECT USING (true);

-- Org admins manage; all writes also allowed via service role in server actions
DROP POLICY IF EXISTS "live_streams_admin_write" ON public.live_streams;
CREATE POLICY "live_streams_admin_write" ON public.live_streams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = live_streams.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- ── Plan config: social_integration feature flag (Pro+) ───────────────────────
INSERT INTO public.plan_configs (tier, feature, enabled, limit_value) VALUES
  ('free',     'social_integration', false, null),
  ('starter',  'social_integration', false, null),
  ('pro',      'social_integration', true,  null),
  ('club',     'social_integration', true,  null),
  ('internal', 'social_integration', true,  null)
ON CONFLICT (tier, feature) DO UPDATE SET enabled = EXCLUDED.enabled;
