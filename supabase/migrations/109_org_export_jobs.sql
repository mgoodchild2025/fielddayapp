-- Tenant data export jobs
-- Tracks async export requests: status, storage path, rate limiting, audit trail

CREATE TABLE IF NOT EXISTS public.org_export_jobs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by        uuid        NOT NULL REFERENCES public.profiles(id),
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'expired')),
  storage_path        text,       -- path in tenant-exports bucket once ready
  archive_size_bytes  bigint,
  error_message       text,
  ip_address          text,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  expires_at          timestamptz,  -- 7 days from completed_at
  downloaded_at       timestamptz   -- last download timestamp
);

CREATE INDEX IF NOT EXISTS org_export_jobs_org_idx
  ON public.org_export_jobs (organization_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS org_export_jobs_status_idx
  ON public.org_export_jobs (status)
  WHERE status IN ('pending', 'processing', 'ready');

ALTER TABLE public.org_export_jobs ENABLE ROW LEVEL SECURITY;

-- Service role full access (used by all server-side operations)
DROP POLICY IF EXISTS "export_jobs_service_all" ON public.org_export_jobs;
CREATE POLICY "export_jobs_service_all" ON public.org_export_jobs
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- Org admins can read their own org's jobs
DROP POLICY IF EXISTS "export_jobs_org_admin_read" ON public.org_export_jobs;
CREATE POLICY "export_jobs_org_admin_read" ON public.org_export_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_export_jobs.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role = 'org_admin'
        AND om.status = 'active'
    )
  );

-- Storage bucket for tenant export archives (private, signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-exports',
  'tenant-exports',
  false,
  524288000,  -- 500 MB limit per archive
  ARRAY['application/zip', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Only service role can read/write the exports bucket
DROP POLICY IF EXISTS "tenant_exports_service_all" ON storage.objects;
CREATE POLICY "tenant_exports_service_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'tenant-exports' AND (SELECT auth.role()) = 'service_role');
