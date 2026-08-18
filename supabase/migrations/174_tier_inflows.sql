-- Flexible brackets Phase 2: cross-tier routes as first-class tier settings.
--
-- A tier can now declare that it RECEIVES the losers of another tier's round
-- (e.g. Silver receives the losers of Gold's first round), and that its top N
-- direct seeds bye past its entry round (e.g. seeds 9-10 start in the semis).
-- Generation lays out the receiving bracket from
--   { direct seeds, inflow slots, bye seeds }
-- and wires loser_to_match_id across the two brackets automatically, so the
-- whole structure regenerates from standings in one click.

ALTER TABLE public.playoff_tiers
  -- Tier whose losers drop into this tier (null = no inflow)
  ADD COLUMN IF NOT EXISTS inflow_from_tier_id uuid REFERENCES public.playoff_tiers(id) ON DELETE SET NULL,
  -- Which round of the source tier feeds this tier (1 = the source's first round)
  ADD COLUMN IF NOT EXISTS inflow_round int NOT NULL DEFAULT 1 CHECK (inflow_round >= 1),
  -- How many of this tier's top direct seeds skip its entry round
  ADD COLUMN IF NOT EXISTS bye_seeds int NOT NULL DEFAULT 0 CHECK (bye_seeds >= 0);

COMMENT ON COLUMN public.playoff_tiers.inflow_from_tier_id IS
  'Tier whose round losers drop into this tier''s bracket (cross-tier drop-down).';
COMMENT ON COLUMN public.playoff_tiers.inflow_round IS
  'Which round of the source tier feeds this tier: 1 = the source''s first round.';
COMMENT ON COLUMN public.playoff_tiers.bye_seeds IS
  'Number of this tier''s top direct seeds that bye past the entry round.';
