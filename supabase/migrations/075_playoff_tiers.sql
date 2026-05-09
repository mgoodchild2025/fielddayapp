-- Playoff tier system
-- playoff_configs: one per league, stores overall seeding method
-- playoff_tiers: each named tier (Gold/Silver/Bronze etc.) within a config,
--   points to the brackets row once the bracket is generated.

CREATE TABLE IF NOT EXISTS public.playoff_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id        uuid        NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  seeding_method   text        NOT NULL DEFAULT 'standings'
                               CHECK (seeding_method IN ('standings', 'manual')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playoff_tiers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_id        uuid        NOT NULL REFERENCES public.playoff_configs(id) ON DELETE CASCADE,
  bracket_id       uuid        REFERENCES public.brackets(id) ON DELETE SET NULL,
  name             text        NOT NULL,
  sort_order       int         NOT NULL DEFAULT 0,
  seed_from        int         NOT NULL,
  seed_to          int         NOT NULL,
  bracket_type     text        NOT NULL DEFAULT 'single_elimination'
                               CHECK (bracket_type IN ('single_elimination', 'double_elimination')),
  third_place_game boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS — all admin operations use service role client, but enable for completeness
ALTER TABLE public.playoff_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_tiers   ENABLE ROW LEVEL SECURITY;

-- Org admins / league admins can do everything; other org members can read
DROP POLICY IF EXISTS "org_admin_all_playoff_configs" ON public.playoff_configs;
CREATE POLICY "org_admin_all_playoff_configs" ON public.playoff_configs
  FOR ALL
  USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = playoff_configs.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
    )
  );

DROP POLICY IF EXISTS "org_admin_all_playoff_tiers" ON public.playoff_tiers;
CREATE POLICY "org_admin_all_playoff_tiers" ON public.playoff_tiers
  FOR ALL
  USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = playoff_tiers.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
    )
  );
