-- ── Soft-delete for events (leagues) ──────────────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

-- Index for the Trash view (soft-deleted events per org)
CREATE INDEX IF NOT EXISTS leagues_deleted_at_idx
  ON public.leagues (organization_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── Audit log (extensible) ────────────────────────────────────────────────────
-- Generic event log: any system action can be recorded here. The action,
-- target_type, and metadata columns are free-form so new event types can be
-- added without schema changes.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id   uuid        REFERENCES public.profiles(id),   -- null = system/cron
  actor_label     text,                                         -- snapshot of actor name/email
  action          text        NOT NULL,                         -- e.g. 'event.deleted'
  target_type     text,                                         -- e.g. 'league'
  target_id       uuid,
  target_label    text,                                         -- snapshot, survives target deletion
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON public.audit_logs (organization_id, action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Org admins can read their org's audit log
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = audit_logs.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- All writes go through the service role in server actions
DROP POLICY IF EXISTS "audit_logs_service_all" ON public.audit_logs;
CREATE POLICY "audit_logs_service_all" ON public.audit_logs
  FOR ALL USING (auth.role() = 'service_role');
