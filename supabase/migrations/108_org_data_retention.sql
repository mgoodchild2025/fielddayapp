-- Track when an org's player data was de-identified following subscription cancellation.
-- The export window closes 30 days after subscription end; de-identification is completed
-- within 60 days of the window closing (90 days total from subscription end).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS data_deidentified_at timestamptz;

-- Audit log for org-level de-identification events
CREATE TABLE IF NOT EXISTS public.org_data_retention_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type          text        NOT NULL CHECK (event_type IN ('export', 'deidentification', 'deletion')),
  triggered_by        text        NOT NULL CHECK (triggered_by IN ('admin', 'platform_admin', 'cron')),
  triggered_by_user   uuid,       -- null for cron
  player_count        integer,    -- how many players were affected
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_data_retention_logs_org_idx
  ON public.org_data_retention_logs (organization_id, created_at DESC);

ALTER TABLE public.org_data_retention_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_retention_logs" ON public.org_data_retention_logs;
CREATE POLICY "service_all_retention_logs" ON public.org_data_retention_logs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "org_admin_read_retention_logs" ON public.org_data_retention_logs;
CREATE POLICY "org_admin_read_retention_logs" ON public.org_data_retention_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_data_retention_logs.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin')
        AND om.status = 'active'
    )
  );
