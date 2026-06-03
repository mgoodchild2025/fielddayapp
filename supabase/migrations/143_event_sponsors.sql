-- Per-event sponsors. Reuses org_sponsors as the shared directory (sponsor_id)
-- and also supports event-only sponsors (inline name/logo/website when sponsor_id is null).
-- show_org_sponsors: when true (default), all org sponsors also appear on the event.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS show_org_sponsors boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.event_sponsors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  sponsor_id      uuid        REFERENCES public.org_sponsors(id) ON DELETE CASCADE,  -- set = reuse an org sponsor
  name            text,        -- event-only sponsor fields (used when sponsor_id is null)
  logo_url        text,
  website_url     text,
  tier            text        NOT NULL DEFAULT 'standard'
                              CHECK (tier IN ('gold','silver','bronze','standard')),
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_sponsors_league_idx
  ON public.event_sponsors (league_id, display_order);

ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_sponsors_admin" ON public.event_sponsors;
CREATE POLICY "event_sponsors_admin" ON public.event_sponsors
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.organization_id = event_sponsors.organization_id
      AND om.user_id = (SELECT auth.uid())
      AND om.role IN ('org_admin','league_admin')
  ));

DROP POLICY IF EXISTS "event_sponsors_public_read" ON public.event_sponsors;
CREATE POLICY "event_sponsors_public_read" ON public.event_sponsors FOR SELECT USING (true);
