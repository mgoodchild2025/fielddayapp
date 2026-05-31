-- ── Social account connections (Phase 1: YouTube own-channel sync) ─────────────
CREATE TABLE IF NOT EXISTS public.social_connections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform            text        NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  external_account_id text        NOT NULL,           -- e.g. YouTube channel ID
  account_handle      text,
  uploads_playlist_id text,                           -- YouTube uploads playlist (cached)
  sync_enabled        boolean     NOT NULL DEFAULT true,
  live_sync_enabled   boolean     NOT NULL DEFAULT true,
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_connections_admin_all" ON public.social_connections;
CREATE POLICY "social_connections_admin_all" ON public.social_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = social_connections.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "social_connections_service" ON public.social_connections;
CREATE POLICY "social_connections_service" ON public.social_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ── Synced social media items (uploads → moderation queue → public) ────────────
CREATE TABLE IF NOT EXISTS public.social_media_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id   uuid        REFERENCES public.social_connections(id) ON DELETE CASCADE,
  platform        text        NOT NULL,
  external_id     text        NOT NULL,               -- e.g. YouTube video ID
  type            text        NOT NULL DEFAULT 'video' CHECK (type IN ('video', 'image', 'reel')),
  media_url       text        NOT NULL,               -- watch/permalink URL
  embed_url       text,
  thumbnail_url   text,
  caption         text,
  posted_at       timestamptz,
  approved        boolean     NOT NULL DEFAULT false, -- review-before-display
  hidden          boolean     NOT NULL DEFAULT false, -- admin explicitly hid it
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS social_media_items_org_idx
  ON public.social_media_items (organization_id, approved, posted_at DESC);

ALTER TABLE public.social_media_items ENABLE ROW LEVEL SECURITY;

-- Public can read approved, non-hidden items
DROP POLICY IF EXISTS "social_media_items_public_read" ON public.social_media_items;
CREATE POLICY "social_media_items_public_read" ON public.social_media_items
  FOR SELECT USING (approved = true AND hidden = false);

DROP POLICY IF EXISTS "social_media_items_admin_all" ON public.social_media_items;
CREATE POLICY "social_media_items_admin_all" ON public.social_media_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = social_media_items.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('org_admin', 'league_admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "social_media_items_service" ON public.social_media_items;
CREATE POLICY "social_media_items_service" ON public.social_media_items
  FOR ALL USING (auth.role() = 'service_role');
