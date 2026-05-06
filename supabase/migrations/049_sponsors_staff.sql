-- Sponsors for org public sites
CREATE TABLE IF NOT EXISTS org_sponsors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  logo_url        text,
  website_url     text,
  tier            text        NOT NULL DEFAULT 'standard'
                              CHECK (tier IN ('gold', 'silver', 'bronze', 'standard')),
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_sponsors_org_order ON org_sponsors (organization_id, tier, display_order);
ALTER TABLE org_sponsors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_sponsors_admin" ON org_sponsors;
CREATE POLICY "org_sponsors_admin" ON org_sponsors
  USING (EXISTS (SELECT 1 FROM org_members WHERE org_members.organization_id = org_sponsors.organization_id AND org_members.user_id = auth.uid() AND org_members.role IN ('org_admin','league_admin')));
DROP POLICY IF EXISTS "org_sponsors_public_read" ON org_sponsors;
CREATE POLICY "org_sponsors_public_read" ON org_sponsors FOR SELECT USING (true);

-- Staff / volunteer spotlights
CREATE TABLE IF NOT EXISTS org_staff (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  role            text,
  bio             text,
  avatar_url      text,
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_staff_org_order ON org_staff (organization_id, display_order);
ALTER TABLE org_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_staff_admin" ON org_staff;
CREATE POLICY "org_staff_admin" ON org_staff
  USING (EXISTS (SELECT 1 FROM org_members WHERE org_members.organization_id = org_staff.organization_id AND org_members.user_id = auth.uid() AND org_members.role IN ('org_admin','league_admin')));
DROP POLICY IF EXISTS "org_staff_public_read" ON org_staff;
CREATE POLICY "org_staff_public_read" ON org_staff FOR SELECT USING (true);
