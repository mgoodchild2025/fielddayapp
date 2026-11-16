-- 205_media_auto_approve.sql
-- Per-event switch: player photo/video uploads go live straight away instead
-- of waiting in the approval queue (tournament day — nobody has time to
-- approve, and a photo that doesn't reach the TV within a minute stops people
-- uploading). Admins can still hide or delete anything afterwards.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS media_auto_approve boolean NOT NULL DEFAULT false;
