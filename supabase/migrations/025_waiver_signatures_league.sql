-- Attach league context to waiver signatures so admins can filter by event
ALTER TABLE public.waiver_signatures
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;

-- Index for admin queries filtering by league
CREATE INDEX IF NOT EXISTS waiver_signatures_league_id_idx
  ON public.waiver_signatures (league_id);

-- Index for admin queries filtering by org + signed_at (for the signatures list page)
CREATE INDEX IF NOT EXISTS waiver_signatures_org_signed_idx
  ON public.waiver_signatures (organization_id, signed_at DESC);
