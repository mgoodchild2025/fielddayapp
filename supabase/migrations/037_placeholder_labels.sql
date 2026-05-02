-- Migration 037: Placeholder labels for pre-scheduled games and bracket matches
-- Allows admins to build schedules and bracket structures before teams register.
-- When the FK is null, these text columns provide a display name
-- (e.g. "Team 1", "Seed 3", "Winner QF-1").
-- When the FK is populated the label is ignored for display.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS home_team_label text,
  ADD COLUMN IF NOT EXISTS away_team_label text;

ALTER TABLE public.bracket_matches
  ADD COLUMN IF NOT EXISTS team1_label text,
  ADD COLUMN IF NOT EXISTS team2_label text;

-- Extend brackets.status to include 'scaffold' (template bracket with no teams yet)
ALTER TABLE public.brackets
  DROP CONSTRAINT IF EXISTS brackets_status_check;

ALTER TABLE public.brackets
  ADD CONSTRAINT brackets_status_check
    CHECK (status IN ('setup', 'scaffold', 'seeding', 'active', 'completed'));
