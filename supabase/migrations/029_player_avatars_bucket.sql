-- Migration: player-avatars storage bucket
-- Public bucket for player profile pictures.
-- Path convention: {userId}/avatar.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-avatars',
  'player-avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can view avatar images)
drop policy if exists "player_avatars_public_read" on storage.objects;
create policy "player_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'player-avatars');

-- Authenticated users can upload/update their own avatar
-- Path must start with their user ID: {userId}/avatar.*
drop policy if exists "player_avatars_owner_write" on storage.objects;
create policy "player_avatars_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'player-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "player_avatars_owner_update" on storage.objects;
create policy "player_avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'player-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "player_avatars_owner_delete" on storage.objects;
create policy "player_avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'player-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
