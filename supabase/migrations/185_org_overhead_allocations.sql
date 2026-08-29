-- 185_org_overhead_allocations.sql
-- Allocate portions of an org overhead expense (e.g. a 12-month facility
-- rental) to specific events, so each event's P&L carries its fair share.
-- The unallocated remainder stays pure org overhead. Allocations are
-- replace-all per expense from the admin UI; deleting the expense or the
-- event removes its allocations.

CREATE TABLE IF NOT EXISTS public.org_overhead_allocations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  overhead_id     uuid        NOT NULL REFERENCES public.org_overhead_expenses(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  amount_cents    integer     NOT NULL CHECK (amount_cents > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (overhead_id, league_id)
);

CREATE INDEX IF NOT EXISTS org_overhead_alloc_league_idx ON public.org_overhead_allocations (league_id);
CREATE INDEX IF NOT EXISTS org_overhead_alloc_org_idx ON public.org_overhead_allocations (organization_id);

ALTER TABLE public.org_overhead_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_org_overhead_alloc" ON public.org_overhead_allocations;
CREATE POLICY "service_role_all_org_overhead_alloc" ON public.org_overhead_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_org_overhead_alloc" ON public.org_overhead_allocations;
CREATE POLICY "org_admin_org_overhead_alloc" ON public.org_overhead_allocations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_overhead_allocations.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_overhead_allocations.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
