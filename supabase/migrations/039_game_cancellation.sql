-- Add cancellation_reason field to games so admins can record why a game was cancelled/postponed.
-- The status column already supports 'cancelled' and 'postponed' from the initial schema.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.games.cancellation_reason IS
  'Optional reason shown to players when a game is cancelled or postponed.';
