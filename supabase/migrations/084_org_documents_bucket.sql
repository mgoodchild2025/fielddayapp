-- Storage bucket for org PDF documents (rules, format, waivers)
-- Public reads so participants can open PDFs in a new tab.
-- Writes go through service-role server actions only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-documents',
  'org-documents',
  true,
  10485760, -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (participants open PDFs directly)
DROP POLICY IF EXISTS "org_documents_public_read" ON storage.objects;
CREATE POLICY "org_documents_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-documents');

-- Service role manages all writes (all server actions use the service role client)
DROP POLICY IF EXISTS "org_documents_service_role_all" ON storage.objects;
CREATE POLICY "org_documents_service_role_all"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'org-documents' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'org-documents' AND auth.role() = 'service_role');
