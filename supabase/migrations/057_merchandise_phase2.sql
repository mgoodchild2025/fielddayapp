-- 057_merchandise_phase2.sql
-- Merchandise Phase 2: per-event price overrides + image storage bucket

-- ── Per-event price override on league_merchandise ────────────────────────────

ALTER TABLE public.league_merchandise
  ADD COLUMN IF NOT EXISTS price_override_cents integer;

-- ── Merchandise images storage bucket ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'merchandise-images',
  'merchandise-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can fetch item images)
DROP POLICY IF EXISTS "merchandise_images_public_read" ON storage.objects;
CREATE POLICY "merchandise_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'merchandise-images');

-- Org/league admins can upload
DROP POLICY IF EXISTS "merchandise_images_admin_insert" ON storage.objects;
CREATE POLICY "merchandise_images_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );

-- Org/league admins can update (replace)
DROP POLICY IF EXISTS "merchandise_images_admin_update" ON storage.objects;
CREATE POLICY "merchandise_images_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );

-- Org/league admins can delete
DROP POLICY IF EXISTS "merchandise_images_admin_delete" ON storage.objects;
CREATE POLICY "merchandise_images_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'merchandise-images'
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('org_admin', 'league_admin')
        AND status = 'active'
    )
  );
