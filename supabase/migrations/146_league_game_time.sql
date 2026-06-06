-- Typical game/session start and end time for an event.
-- Stored as PostgreSQL time (HH:MM:SS, timezone-naive — displayed in the org's timezone).
-- Purely informational: shown on the event page alongside the days_of_week.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS game_start_time time,
  ADD COLUMN IF NOT EXISTS game_end_time   time;

COMMENT ON COLUMN public.leagues.game_start_time IS
  'Typical start time for games/sessions in this event (e.g. 19:00).';
COMMENT ON COLUMN public.leagues.game_end_time IS
  'Typical end time for games/sessions in this event (e.g. 21:00).';
