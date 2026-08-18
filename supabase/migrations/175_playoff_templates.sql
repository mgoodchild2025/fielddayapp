-- Flexible brackets Phase 3: org-saved playoff format templates.
--
-- An admin can save the current tier configuration (including Phase 2
-- drop-down + bye settings) under a name and re-apply it to future events
-- from the format picker. Built-in formats live in code; this table holds
-- the org's own custom shapes.

CREATE TABLE IF NOT EXISTS public.org_playoff_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- TierTemplateSpec[]: { name, seedFrom, seedTo, bracketType,
  --   thirdPlaceGame, inflowFromTierIndex, byeSeeds }
  tiers jsonb NOT NULL,
  -- Team count the template was built for (shown as a hint in the picker)
  team_count int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS org_playoff_templates_org_idx
  ON public.org_playoff_templates (organization_id, created_at DESC);

-- Service-role only (all access goes through guarded server actions)
ALTER TABLE public.org_playoff_templates ENABLE ROW LEVEL SECURITY;
