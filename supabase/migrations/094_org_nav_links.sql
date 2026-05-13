-- Custom navigation links configurable by org admins.
-- Displayed in OrgNav (desktop) and MobileNav (mobile drawer).

CREATE TABLE IF NOT EXISTS public.org_nav_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label            text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  link_type        text        NOT NULL DEFAULT 'url' CHECK (link_type IN ('url', 'document')),
  url              text        NOT NULL,
  open_in_new_tab  boolean     NOT NULL DEFAULT true,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_nav_links_org_id_idx
  ON public.org_nav_links (organization_id, sort_order);

ALTER TABLE public.org_nav_links ENABLE ROW LEVEL SECURITY;

-- Org admins can manage their own org's links
DROP POLICY IF EXISTS "org_admin_manage_nav_links" ON public.org_nav_links;
CREATE POLICY "org_admin_manage_nav_links" ON public.org_nav_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_nav_links.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

-- Public read — anyone can load the nav
DROP POLICY IF EXISTS "public_read_nav_links" ON public.org_nav_links;
CREATE POLICY "public_read_nav_links" ON public.org_nav_links
  FOR SELECT USING (true);
