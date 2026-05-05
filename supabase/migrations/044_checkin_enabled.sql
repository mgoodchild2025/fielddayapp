ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS checkin_enabled boolean NOT NULL DEFAULT false;
