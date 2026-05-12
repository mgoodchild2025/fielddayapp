-- Add standings_pts_method to leagues for configurable PTS column
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS standings_pts_method text NOT NULL DEFAULT 'wins'
    CHECK (standings_pts_method IN ('wins', 'set_wins', 'set_differential', 'points_for'));
