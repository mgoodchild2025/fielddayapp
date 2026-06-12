-- 162_event_revenue.sql
-- Other (non-registration, non-merch) income for an event: donations, 50/50
-- draw, sponsorships, concessions, fundraisers, etc. Mirrors event_expenses and
-- feeds the event + org P&L.

CREATE TABLE IF NOT EXISTS public.event_revenue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  category        text        NOT NULL DEFAULT 'other'
                    CHECK (category IN ('donation','fifty_fifty','sponsorship','concessions','fundraiser','other')),
  description     text        NOT NULL,
  amount_cents    integer     NOT NULL CHECK (amount_cents >= 0),
  source          text,
  received_on     date,
  notes           text,
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_revenue_league_idx ON public.event_revenue (league_id, received_on);
CREATE INDEX IF NOT EXISTS event_revenue_org_idx    ON public.event_revenue (organization_id);

ALTER TABLE public.event_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_revenue" ON public.event_revenue;
CREATE POLICY "service_role_all_event_revenue" ON public.event_revenue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_event_revenue" ON public.event_revenue;
CREATE POLICY "org_admin_event_revenue" ON public.event_revenue
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_revenue.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_revenue.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
