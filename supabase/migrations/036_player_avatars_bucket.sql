-- ── Player Avatars Storage ────────────────────────────────────────────────────
-- One avatar per user, stored at {userId}/avatar.{ext}
-- Public bucket so avatars render without auth tokens in <img> tags.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-avatars',
  'player-avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies ──────────────────────────────────────────────────────────────

-- Anyone can read avatar images (public bucket, but belt-and-suspenders)
DROP POLICY IF EXISTS "player_avatars_public_read" ON storage.objects;
CREATE POLICY "player_avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'player-avatars');

-- Authenticated users can INSERT/UPDATE only inside their own folder
DROP POLICY IF EXISTS "player_avatars_owner_insert" ON storage.objects;
CREATE POLICY "player_avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "player_avatars_owner_update" ON storage.objects;
CREATE POLICY "player_avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "player_avatars_owner_delete" ON storage.objects;
CREATE POLICY "player_avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'player-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
