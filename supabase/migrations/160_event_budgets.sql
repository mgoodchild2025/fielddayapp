-- 160_event_budgets.sql
-- Pricing planner: a projected budget worksheet per event (separate from the
-- event_expenses actuals). Cost line items scale fixed / per-team / per-player;
-- combined with expected counts + a target margin, the UI derives a recommended
-- price per player or team. Advise-only — nothing writes back to the league.

CREATE TABLE IF NOT EXISTS public.event_budgets (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id             uuid        NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  expected_teams        integer     NOT NULL DEFAULT 0 CHECK (expected_teams >= 0),
  expected_participants integer     NOT NULL DEFAULT 0 CHECK (expected_participants >= 0),
  target_margin_pct     numeric     NOT NULL DEFAULT 0 CHECK (target_margin_pct >= 0 AND target_margin_pct < 1),
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_budget_items (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id    uuid    NOT NULL REFERENCES public.event_budgets(id) ON DELETE CASCADE,
  label        text    NOT NULL,
  cost_type    text    NOT NULL DEFAULT 'fixed' CHECK (cost_type IN ('fixed','per_team','per_player')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  sort_order   integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS event_budget_items_budget_idx ON public.event_budget_items (budget_id, sort_order);

ALTER TABLE public.event_budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_budgets" ON public.event_budgets;
CREATE POLICY "service_role_all_event_budgets" ON public.event_budgets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_event_budgets" ON public.event_budgets;
CREATE POLICY "org_admin_event_budgets" ON public.event_budgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_budgets.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_budgets.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "service_role_all_event_budget_items" ON public.event_budget_items;
CREATE POLICY "service_role_all_event_budget_items" ON public.event_budget_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_event_budget_items" ON public.event_budget_items;
CREATE POLICY "org_admin_event_budget_items" ON public.event_budget_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_budgets b
        JOIN public.org_members om ON om.organization_id = b.organization_id
      WHERE b.id = event_budget_items.budget_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_budgets b
        JOIN public.org_members om ON om.organization_id = b.organization_id
      WHERE b.id = event_budget_items.budget_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
