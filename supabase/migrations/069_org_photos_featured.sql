-- Allow admins to mark specific photos as featured for home page display
ALTER TABLE public.org_photos
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
