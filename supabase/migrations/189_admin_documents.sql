-- 189_admin_documents.sql
-- Private admin document library: permits, insurance certificates, facility
-- contracts. Distinct from league_documents (player-facing rules PDFs with
-- public URLs) — these are admin-only, stored in a PRIVATE bucket and viewed
-- via short-lived signed URLs. league_id null = org-level document.

CREATE TABLE IF NOT EXISTS public.admin_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id       uuid        REFERENCES public.leagues(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  category        text        NOT NULL DEFAULT 'other'
                    CHECK (category IN ('permit','insurance','contract','other')),
  file_path       text        NOT NULL,
  uploaded_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_documents_org_idx    ON public.admin_documents (organization_id, created_at);
CREATE INDEX IF NOT EXISTS admin_documents_league_idx ON public.admin_documents (league_id);

ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_admin_documents" ON public.admin_documents;
CREATE POLICY "service_role_all_admin_documents" ON public.admin_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_admin_admin_documents" ON public.admin_documents;
CREATE POLICY "org_admin_admin_documents" ON public.admin_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = admin_documents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = admin_documents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-documents', 'admin-documents', false,
  20971520,  -- 20 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- No public read policy — service role only; the app hands out signed URLs.
DROP POLICY IF EXISTS "service role manages admin documents" ON storage.objects;
CREATE POLICY "service role manages admin documents"
  ON storage.objects FOR ALL
  USING (bucket_id = 'admin-documents')
  WITH CHECK (bucket_id = 'admin-documents');
