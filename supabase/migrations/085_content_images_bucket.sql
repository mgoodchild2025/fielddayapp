-- Content images bucket for rich text editor uploads (waivers, rules, event descriptions, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload
DROP POLICY IF EXISTS "authenticated_upload_content_images" ON storage.objects;
CREATE POLICY "authenticated_upload_content_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-images');

-- Public read
DROP POLICY IF EXISTS "public_read_content_images" ON storage.objects;
CREATE POLICY "public_read_content_images" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-images');

-- Authenticated users can delete their own uploads (optional, for cleanup)
DROP POLICY IF EXISTS "authenticated_delete_content_images" ON storage.objects;
CREATE POLICY "authenticated_delete_content_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'content-images');
