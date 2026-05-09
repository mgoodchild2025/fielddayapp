-- Add a rich-text "Event Format" field to leagues.
-- Describes how the event is structured (e.g. round-robin, playoff format,
-- set/period rules) and is displayed on the public event page alongside Rules.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS format_content text;
