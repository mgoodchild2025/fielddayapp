-- ── Tournament Display Mode ──────────────────────────────────────────────────
-- Stores per-screen display configuration for live tournament TVs.
-- One row per (league, screen_number). Public-readable so the TV URL needs no auth.

CREATE TABLE IF NOT EXISTS public.event_display_configs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  screen_number   integer     NOT NULL DEFAULT 1 CHECK (screen_number BETWEEN 1 AND 4),
  config          jsonb       NOT NULL DEFAULT '{}',
  enabled         boolean     NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, screen_number)
);

ALTER TABLE public.event_display_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_display_configs" ON public.event_display_configs;
CREATE POLICY "public_read_display_configs" ON public.event_display_configs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "org_admin_manage_display_configs" ON public.event_display_configs;
CREATE POLICY "org_admin_manage_display_configs" ON public.event_display_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_display_configs.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
