-- 1. Allow discounts to be scoped to a specific event (league).
--    When league_id is set, the code only works for that event.
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS discount_codes_league_idx
  ON public.discount_codes (league_id)
  WHERE league_id IS NOT NULL;

-- 2. Add 'shop' as a valid applies_to value so codes can be
--    restricted to shop purchases only.
ALTER TABLE public.discount_codes
  DROP CONSTRAINT IF EXISTS discount_codes_applies_to_check;

ALTER TABLE public.discount_codes
  ADD CONSTRAINT discount_codes_applies_to_check
    CHECK (applies_to IN ('all', 'leagues', 'dropins', 'shop'));
