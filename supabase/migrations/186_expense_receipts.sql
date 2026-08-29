-- 186_expense_receipts.sql
-- Receipt attachments (photo / PDF) on event expenses and org overhead.
-- The bucket is PRIVATE — receipts are financial documents — and viewed via
-- short-lived signed URLs generated server-side for finance admins only.

ALTER TABLE public.event_expenses        ADD COLUMN IF NOT EXISTS receipt_path text;
ALTER TABLE public.org_overhead_expenses ADD COLUMN IF NOT EXISTS receipt_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts', 'expense-receipts', false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- No public read policy: only the service role touches this bucket, and the
-- app hands out time-limited signed URLs.
DROP POLICY IF EXISTS "service role manages expense receipts" ON storage.objects;
CREATE POLICY "service role manages expense receipts"
  ON storage.objects FOR ALL
  USING (bucket_id = 'expense-receipts')
  WITH CHECK (bucket_id = 'expense-receipts');
