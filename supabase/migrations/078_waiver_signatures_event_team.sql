-- Preserve the event name on waiver signatures so it survives league deletion.
-- Also store an optional self-reported team name from the shareable waiver form.

ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS league_name text,
  ADD COLUMN IF NOT EXISTS team_name   text;
