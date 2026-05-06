-- Add logo column to leagues
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket for event logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-logos', 'event-logos', true,
  5242880,  -- 5 MB (see migration 051 for update)
  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "event logos are publicly readable" ON storage.objects;
CREATE POLICY "event logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-logos');

-- Service role manages uploads (server actions use service role client)
DROP POLICY IF EXISTS "service role manages event logos" ON storage.objects;
CREATE POLICY "service role manages event logos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'event-logos')
  WITH CHECK (bucket_id = 'event-logos');
