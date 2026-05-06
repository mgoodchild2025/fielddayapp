-- Photo gallery for org public sites
CREATE TABLE IF NOT EXISTS org_photos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url             text        NOT NULL,
  caption         text,
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_photos_org_order ON org_photos (organization_id, display_order);

ALTER TABLE org_photos ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
DROP POLICY IF EXISTS "org_photos_admin" ON org_photos;
CREATE POLICY "org_photos_admin" ON org_photos
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.organization_id = org_photos.organization_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

-- Public read for site rendering
DROP POLICY IF EXISTS "org_photos_public_read" ON org_photos;
CREATE POLICY "org_photos_public_read" ON org_photos
  FOR SELECT USING (true);

-- Storage bucket for org photos (run manually in Supabase dashboard if not using migrations for storage)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('org-photos', 'org-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
-- ON CONFLICT (id) DO NOTHING;
