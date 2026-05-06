-- Site theme selection on org_branding
ALTER TABLE org_branding
  ADD COLUMN IF NOT EXISTS site_theme text NOT NULL DEFAULT 'community'
    CHECK (site_theme IN ('community', 'club', 'pro'));

-- Flexible content blocks per org (hero copy, about text, etc.)
CREATE TABLE IF NOT EXISTS org_site_content (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key     text    NOT NULL,   -- e.g. 'hero', 'about', 'cta_banner'
  content         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, section_key)
);

ALTER TABLE org_site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_site_content_admin" ON org_site_content;
CREATE POLICY "org_site_content_admin" ON org_site_content
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.organization_id = org_site_content.organization_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('org_admin', 'league_admin')
    )
  );

-- Public read for site rendering (server component uses service role anyway, but good practice)
DROP POLICY IF EXISTS "org_site_content_public_read" ON org_site_content;
CREATE POLICY "org_site_content_public_read" ON org_site_content
  FOR SELECT USING (true);
