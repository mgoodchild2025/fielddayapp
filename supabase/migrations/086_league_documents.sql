-- Per-league downloadable documents (PDFs) visible to players on the event page.
-- Replaces the single-slot rules_pdf_url / format_pdf_url columns with an
-- ordered, multi-document table.

CREATE TABLE IF NOT EXISTS public.league_documents (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id        uuid        NOT NULL REFERENCES public.leagues(id)       ON DELETE CASCADE,
  title            text        NOT NULL,
  file_url         text        NOT NULL,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_documents ENABLE ROW LEVEL SECURITY;

-- Admins can manage documents for their org
DROP POLICY IF EXISTS "org_admin_manage_league_documents" ON public.league_documents;
CREATE POLICY "org_admin_manage_league_documents" ON public.league_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = league_documents.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- Read access — controlled at app level based on documents_visibility;
-- RLS just allows the select, app decides what to return.
DROP POLICY IF EXISTS "public_read_league_documents" ON public.league_documents;
CREATE POLICY "public_read_league_documents" ON public.league_documents
  FOR SELECT USING (true);

-- documents_visibility column on leagues (mirrors schedule_visibility / standings_visibility)
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS documents_visibility text NOT NULL DEFAULT 'public';

-- Migrate existing single-slot PDF URLs into the new table
-- (Only inserts if the column still has data — safe to run on clean DBs)
INSERT INTO public.league_documents (organization_id, league_id, title, file_url, sort_order, created_at)
SELECT organization_id, id, 'Rules', rules_pdf_url, 0, now()
FROM   public.leagues
WHERE  rules_pdf_url IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.league_documents (organization_id, league_id, title, file_url, sort_order, created_at)
SELECT organization_id, id, 'Format', format_pdf_url, 1, now()
FROM   public.leagues
WHERE  format_pdf_url IS NOT NULL
ON CONFLICT DO NOTHING;
