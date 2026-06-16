-- 163_event_media.sql
-- User-uploaded event media (photos/videos) stored on Cloudinary. Only metadata
-- lives here; the files live on Cloudinary's CDN. Players upload; items are
-- 'pending' until an org/league admin approves them for the public gallery.

CREATE TABLE IF NOT EXISTS public.event_media (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  league_id            uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  uploaded_by          uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  cloudinary_public_id text        NOT NULL,
  cloudinary_url       text        NOT NULL,
  thumbnail_url        text,
  media_type           text        NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  caption              text,
  width                integer,
  height               integer,
  duration_seconds     numeric,
  status               text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  approved_by          uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_media_league_idx ON public.event_media (league_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS event_media_org_idx    ON public.event_media (organization_id, status, created_at DESC);

ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;

-- Service role (server actions) full access.
DROP POLICY IF EXISTS "service_role_all_event_media" ON public.event_media;
CREATE POLICY "service_role_all_event_media" ON public.event_media
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anyone may read approved media.
DROP POLICY IF EXISTS "public_read_approved_event_media" ON public.event_media;
CREATE POLICY "public_read_approved_event_media" ON public.event_media
  FOR SELECT USING (status = 'approved');

-- Uploaders can see their own items in any status.
DROP POLICY IF EXISTS "uploader_read_own_event_media" ON public.event_media;
CREATE POLICY "uploader_read_own_event_media" ON public.event_media
  FOR SELECT TO authenticated
  USING (uploaded_by = (SELECT auth.uid()));

-- Org/league admins manage everything for their org.
DROP POLICY IF EXISTS "org_admin_event_media" ON public.event_media;
CREATE POLICY "org_admin_event_media" ON public.event_media
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = event_media.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );
