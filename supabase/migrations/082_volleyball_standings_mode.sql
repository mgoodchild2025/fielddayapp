-- Add volleyball_standings_mode to leagues
-- 'match_based' = GP · W · L · SW · SL · PF · PA · +/- · PTS  (ranked by wins → PTS → set ratio → +/-)
-- 'set_based'   = GP · SW · SL · SPF · SPA · +/-               (ranked by SW → set diff → point diff)
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS volleyball_standings_mode text NOT NULL DEFAULT 'match_based'
    CHECK (volleyball_standings_mode IN ('match_based', 'set_based'));
