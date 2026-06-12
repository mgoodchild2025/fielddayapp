-- 159_org_overhead_expenses.sql
-- Org-level overhead costs not tied to a single event (insurance, equipment,
-- software, rent, etc.). Feed the org-wide P&L. applies_to lets a cost be
-- tagged to the shop vs general overhead for future per-area reporting.

CREATE TABLE IF NOT EXISTS public.org_overhead_expenses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category        text        NOT NULL DEFAULT 'other'
                    CHECK (category IN ('insurance','equipment','software','rent','salaries','marketing','other')),
  description     text        NOT NULL,
  amount_cents    integer     NOT NULL CHECK (amount_cents >= 0),
  period          text        NOT NULL DEFAULT 'one_time'
                    CHECK (period IN ('one_time','monthly','annual')),
  applies_to      text        NOT NULL DEFAULT 'general'
                    CHECK (applies_to IN ('general','shop')),
  incurred_on     date,
  notes           text,
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_overhead_org_idx ON public.org_overhead_expenses (organization_id, incurred_on);

ALTER TABLE public.org_overhead_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_org_overhead" ON public.org_overhead_expenses;
CREATE POLICY "service_role_all_org_overhead" ON public.org_overhead_expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_org_overhead" ON public.org_overhead_expenses;
CREATE POLICY "org_admin_org_overhead" ON public.org_overhead_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_overhead_expenses.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_overhead_expenses.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
