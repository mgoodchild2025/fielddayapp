-- Add per-tab visibility controls to leagues.
-- Each tab can be 'public' (anyone) or 'participants' (logged-in registrants/team members only).
-- Defaults to 'public' so existing events are unaffected.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS schedule_visibility text NOT NULL DEFAULT 'public'
    CHECK (schedule_visibility IN ('public', 'participants')),
  ADD COLUMN IF NOT EXISTS standings_visibility text NOT NULL DEFAULT 'public'
    CHECK (standings_visibility IN ('public', 'participants')),
  ADD COLUMN IF NOT EXISTS bracket_visibility text NOT NULL DEFAULT 'public'
    CHECK (bracket_visibility IN ('public', 'participants'));
