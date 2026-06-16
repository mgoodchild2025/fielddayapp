-- 164_social_media_items_event_scope.sql
-- Extend the existing social_media_items (own-channel sync) so admins can also
-- curate specific Instagram/TikTok/YouTube posts onto an event's media gallery.
-- Reuses the table's moderation fields (approved/hidden); curated items are
-- admin-added so they're inserted approved.

ALTER TABLE public.social_media_items
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'channel_sync'
                              CHECK (source IN ('channel_sync', 'curated')),
  ADD COLUMN IF NOT EXISTS added_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_media_items_league_idx
  ON public.social_media_items (league_id, approved, posted_at DESC);

COMMENT ON COLUMN public.social_media_items.source IS
  'channel_sync = synced from a connected org account; curated = an admin pinned a specific post to an event.';
