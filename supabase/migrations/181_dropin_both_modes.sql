-- Drop-in events: offer the season pass AND single sessions together,
-- with an optionally prorating pass price.
--
-- registration_mode gains 'both': the event page shows a season-pass card and
-- the per-session join list side by side. Nothing changes for existing events
-- until an admin picks the new mode.
--
-- season_pass_prorate: when on, the pass price is computed as
--   full price x (remaining non-cancelled sessions / total non-cancelled),
-- rounded up to the next dollar and floored at the single-session price —
-- a mid-season joiner pays for the season that's still ahead of them.
-- Computed at purchase time from event_sessions by one shared helper
-- (lib/season-pass.ts) used by both display and charge; passes already sold
-- never reprice. Works in 'season' mode too, not only 'both'.

ALTER TABLE public.leagues
  DROP CONSTRAINT IF EXISTS leagues_registration_mode_check;

ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_registration_mode_check
    CHECK (registration_mode IN ('session', 'season', 'both'));

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS season_pass_prorate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leagues.season_pass_prorate IS
  'Drop-in events: prorate the season-pass price by remaining sessions (floor = drop-in price). Applies at purchase time only.';
