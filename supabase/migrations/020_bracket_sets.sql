-- Add sets column to bracket_matches for storing per-set scores (e.g. volleyball)
alter table public.bracket_matches
  add column if not exists sets jsonb;
