-- 158_event_expenses.sql
-- Per-event actual costs (rentals, referees, insurance, prizes, etc.) so an
-- event's profit can be computed = revenue (payments + event merch) − expenses.

CREATE TABLE IF NOT EXISTS public.event_expenses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  category        text        NOT NULL DEFAULT 'other'
                    CHECK (category IN ('rental','referee','insurance','prizes','equipment','staff','marketing','other')),
  description     text        NOT NULL,
  amount_cents    integer     NOT NULL CHECK (amount_cents >= 0),
  vendor          text,
  incurred_on     date,
  notes           text,
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_expenses_league_idx ON public.event_expenses (league_id, incurred_on);
CREATE INDEX IF NOT EXISTS event_expenses_org_idx    ON public.event_expenses (organization_id);

ALTER TABLE public.event_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_expenses" ON public.event_expenses;
CREATE POLICY "service_role_all_event_expenses" ON public.event_expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_event_expenses" ON public.event_expenses;
CREATE POLICY "org_admin_event_expenses" ON public.event_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_expenses.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_expenses.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
