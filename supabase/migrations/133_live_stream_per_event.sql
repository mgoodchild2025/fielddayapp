-- Allow a live stream to be tied to a specific event (or org-wide when null),
-- so simultaneous events can each have their own live source.
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS live_streams_league_live_idx
  ON public.live_streams (league_id, status)
  WHERE status = 'live';
