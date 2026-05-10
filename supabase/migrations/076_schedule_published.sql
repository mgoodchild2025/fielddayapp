-- Allow admins to draft a schedule before making it visible to players.
-- Defaults to true so all existing leagues remain visible.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS schedule_published boolean NOT NULL DEFAULT true;
