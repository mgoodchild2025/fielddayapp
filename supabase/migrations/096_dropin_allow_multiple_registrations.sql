-- Drop-in registrations need to allow multiple rows per user per league
-- (one per session). Replace the blanket unique constraint with a partial
-- one that only enforces uniqueness for season registrations.

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_league_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_season_unique
  ON public.registrations (league_id, user_id)
  WHERE registration_type = 'season' OR registration_type IS NULL;
