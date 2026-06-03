-- Sponsor interstitial creatives + impression/click analytics.

-- Full-screen ad creative (distinct from the logo) for interstitials.
ALTER TABLE public.event_sponsors
  ADD COLUMN IF NOT EXISTS ad_image_url text;

-- Daily aggregated sponsor stats (one row per sponsor per event per day).
CREATE TABLE IF NOT EXISTS public.sponsor_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  sponsor_key     text        NOT NULL,   -- event_sponsors.id, or `org-<org_sponsors.id>`
  day             date        NOT NULL DEFAULT current_date,
  impressions     integer     NOT NULL DEFAULT 0,
  clicks          integer     NOT NULL DEFAULT 0,
  UNIQUE (league_id, sponsor_key, day)
);

CREATE INDEX IF NOT EXISTS sponsor_stats_league_idx ON public.sponsor_stats (league_id, day);

ALTER TABLE public.sponsor_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsor_stats_admin_read" ON public.sponsor_stats;
CREATE POLICY "sponsor_stats_admin_read" ON public.sponsor_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.org_members om
    WHERE om.organization_id = sponsor_stats.organization_id
      AND om.user_id = (SELECT auth.uid())
      AND om.role IN ('org_admin','league_admin'))
);
-- Writes happen via the service role (bumps below) which bypasses RLS.

-- Atomic per-day increment for a batch of sponsor keys.
CREATE OR REPLACE FUNCTION public.bump_sponsor_stats(
  p_org uuid, p_league uuid, p_keys text[], p_kind text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE k text;
BEGIN
  IF p_kind NOT IN ('impression', 'click') THEN RETURN; END IF;
  IF p_keys IS NULL THEN RETURN; END IF;
  FOREACH k IN ARRAY p_keys LOOP
    INSERT INTO public.sponsor_stats (organization_id, league_id, sponsor_key, day, impressions, clicks)
    VALUES (p_org, p_league, k, current_date,
            CASE WHEN p_kind = 'impression' THEN 1 ELSE 0 END,
            CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END)
    ON CONFLICT (league_id, sponsor_key, day) DO UPDATE
      SET impressions = public.sponsor_stats.impressions + (CASE WHEN p_kind = 'impression' THEN 1 ELSE 0 END),
          clicks      = public.sponsor_stats.clicks      + (CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END);
  END LOOP;
END; $$;
